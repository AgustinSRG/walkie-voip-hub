// Outgoing session

"use strict";

import { EventEmitter } from 'events';
import { PeerConnectionEvent, RTCSession } from 'jssip/lib/RTCSession';
import WebRTC from 'wrtc';
import { AudioData } from './walkie-incoming-session';

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

    constructor(identity: string) {
        super();

        this.ended = false;
        
        this.identity = identity;

        this.source = new WebRTC.nonstandard.RTCAudioSource();
        this.track = this.source.createTrack();
    }

    public start(session: RTCSession) {
        this.session = session;

        this.session.on("ended", this.onSessionClose.bind(this));
        this.session.on("failed", this.onSessionClose.bind(this));

        this.session.on("confirmed", this.onCallConfirmed.bind(this));
    }

    public destroy() {
        this.ended = true;
        if (this.session.status !== 8) {
            this.session.terminate();
        }
    }

    public getMediaStream(): MediaStream {
        const stream = new MediaStream();
        stream.addTrack(this.track);
        return stream;
    }

    /**
     * Sends audio data
     * @param data Data chunk
     */
    public sendData(data: AudioData) {
        if (!this.ended) {
            this.source.onData(data);
        }
    }

    /**
     * Closes call after 2 seconds
     */
    public close() {
        setTimeout(() => {
            this.destroy();
        }, 2000);
    }

    private onSessionClose(ev: any) {
        this.destroy();
        this.emit("close", this, ev.cause || "undetermined");
    }

    private onCallConfirmed() {
        this.emit("open");
        this.connected = true;
        this.emit("connected", this);
    }
}
