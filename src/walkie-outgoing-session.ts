// Outgoing session

"use strict";

import { AsyncSemaphore } from '@asanrom/async-tools';
import { EventEmitter } from 'events';
import { PeerConnectionEvent, RTCSession } from 'jssip/lib/RTCSession';
import WebRTC from 'wrtc';
import { Config } from './config';
import { AudioData } from './walkie-incoming-session';

interface AudioBufferEntry {
    data: AudioData;
    timestamp: number;
}

const CLOSE_GRACE_TIME = 2000;

/**
 * Outgoing session
 */
export class WalkieOutgoingSession extends EventEmitter {
    public session: RTCSession;
    public identity: string;

    public ended: boolean;
    public connected: boolean;

    public track: MediaStreamTrack;
    public source: WebRTC.nonstandard.RTCAudioSource;

    public buffer: AudioBufferEntry[];
    public bufferSize: number;
    public bufferLimit: number;
    public bufferEnded: boolean;

    private lastRateMsg: number;
    private byteCount: number;

    public sem: AsyncSemaphore;

    public confirmedPromise: Promise<void>;
    public confirmResolve: () => void;

    public lastChunkTimestamp: number;

    constructor(identity: string) {
        super();

        this.ended = false;

        this.identity = identity;

        this.source = new WebRTC.nonstandard.RTCAudioSource();
        this.track = this.source.createTrack();

        this.buffer = [];
        this.bufferSize = 0;
        this.bufferLimit = Config.getInstance().bufferLength * 1024 * 1024;
        this.lastChunkTimestamp = 0;
        this.bufferEnded = false;

        this.sem = new AsyncSemaphore(0);
    }

    /**
     * Starts the session
     * @param session Session
     */
    public start(session: RTCSession) {
        this.session = session;

        this.confirmedPromise = new Promise<void>((resolve) => {
            this.confirmResolve = resolve;
        });

        this.session.on("ended", this.onSessionClose.bind(this));
        this.session.on("failed", this.onSessionClose.bind(this));

        this.session.on("confirmed", this.onCallConfirmed.bind(this));

        this.doLyfeCycle().catch(err => {
            console.error(err);
        });
    }

    /**
     * LifeCycle
     * Waits till chunks are available and sends them in order
     */
    public async doLyfeCycle() {
        // Wait till confirmed
        await this.confirmedPromise;

        if (this.ended) {
            return;
        }

        this.lastRateMsg = Date.now();
        this.byteCount = 0;

        while (!this.ended && (this.buffer.length > 0 || !this.bufferEnded)) {
            try {
                await this.sem.acquire();
            } catch (ex) {
                // Destroyed
                console.error("EX: " + ex.message);
                return;
            }

            //console.log("A")

            if (Date.now() - this.lastRateMsg > 5000) {
                const bitrate = this.byteCount / ((Date.now() - this.lastRateMsg) / 1000);
                this.emit("bitrate", bitrate);
                this.byteCount = 0;
                this.lastRateMsg = Date.now();
            }

            if (this.ended) {
                return;
            }

            if (this.buffer.length === 0) {
                continue;
            }

            const toSend = this.buffer.shift();

            // Wait
            if (this.lastChunkTimestamp) {
                const waitMS = Math.max(1, toSend.timestamp - this.lastChunkTimestamp);

                await (new Promise<void>(resolve => {
                    setTimeout(resolve, waitMS);
                }));
            }

            this.lastChunkTimestamp = toSend.timestamp;

            // Send chunk
            if (!this.ended) {
                this.source.onData(toSend.data);

                this.byteCount += toSend.data.samples.length;
            }
        }

        this.emit("buffer-end", this);

        // Grace time wait
        await (new Promise<void>(resolve => {
            setTimeout(resolve, CLOSE_GRACE_TIME);
        }));

        // Terminate
        this.destroy();
    }

    /**
     * Adds data to the buffer
     * @param data Data
     * @param timestamp Received timestamp 
     */
    public addData(data: AudioData, timestamp: number) {
        this.buffer.push({
            data: data,
            timestamp: timestamp,
        });

        this.bufferSize += data.samples.length;

        while (this.bufferSize > this.bufferLimit && this.buffer.length > 0) {
            const removed = this.buffer.shift();
            this.bufferSize -= removed.data.samples.length;
        }

        this.sem.release();
    }

    /**
     * Closes the session
     */
    public destroy() {
        this.ended = true;
        if (this.session.status !== 8) {
            this.session.terminate();
        }
        if (this.confirmResolve) {
            this.confirmResolve();
            this.confirmResolve = null;
        }
        this.sem.destroy();
    }

    /**
     * Gets the stream to send
     * @returns The MediaStream instance
     */
    public getMediaStream(): MediaStream {
        const stream = new MediaStream();
        stream.addTrack(this.track);
        return stream;
    }

    /**
     * Closes call after 2 seconds
     */
    public close() {
        this.bufferEnded = true;
        this.sem.release();
    }

    private onSessionClose(ev: any) {
        this.destroy();
        this.emit("close", this, ev.cause || "undetermined");
    }

    private onCallConfirmed() {
        this.emit("open");
        this.connected = true;
        this.emit("connected", this);
        if (this.confirmResolve) {
            this.confirmResolve();
            this.confirmResolve = null;
        }
    }
}
