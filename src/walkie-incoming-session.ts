// Incoming session

"use strict";

import { PeerConnectionEvent, RTCSession } from 'jssip/lib/RTCSession';
import { EventEmitter } from 'events';
import { Config } from './config';
import WebRTC from 'wrtc';
import { WalkieOutgoingSession } from './walkie-outgoing-session';

export interface AudioData {
    samples: Int16Array;
    sampleRate: number;
    bitsPerSample: number;
    channelCount: number;
    numberOfFrames: number;
}

/**
 * Incoming session
 */
export class WalkieIncomingSession extends EventEmitter {
    public session: RTCSession;
    public identity: string;

    public buffer: AudioData[];
    public bufferSize: number;
    public bufferLimit: number;

    public track: MediaStreamTrack;
    public sink: WebRTC.nonstandard.RTCAudioSink;

    public pendingMembers: Set<string>;
    public pendingConnected: Set<string>;

    public members: Map<string, WalkieOutgoingSession>;

    public id: string;
    public ended: boolean;

    constructor(session: RTCSession, id: string, members: Set<string>) {
        super();

        this.id = id;
        this.session = session;
        this.identity = session.remote_identity.uri.toString();
        this.buffer = [];
        this.bufferSize = 0;
        this.bufferLimit = Config.getInstance().bufferLength * 1024 * 1024;

        this.pendingMembers = new Set();
        this.members = new Map();

        for (const member of members) {
            if (this.identity !== member) {
                this.pendingMembers.add(member);
                this.pendingConnected.add(member);
            }
        }

        this.ended = false;
    }

    public start() {
        this.session.on("ended", this.onSessionClose.bind(this));
        this.session.on("failed", this.onSessionClose.bind(this));

        this.session.on("confirmed", this.onCallConfirmed.bind(this));
        this.session.on("peerconnection", this.onPeerConnection.bind(this));

        this.session.answer();
    }

    public destroy() {
        if (this.sink) {
            this.sink.removeAllListeners();
            this.sink.stop();
            this.sink = null;
        }
        this.ended = true;
        this.session.removeAllListeners();
        this.session.terminate();
    }

    /* Event listeners */

    private onSessionClose(ev: any) {
        this.destroy();
        this.emit("close", ev.cause || "undetermined");

        if (this.pendingConnected.size === 0) {
            this.emit("finish");
        }
    }

    private onCallConfirmed() {
        this.emit("open");
    }

    private onPeerConnection(ev: PeerConnectionEvent) {
        const connection = ev.peerconnection;

        this.emit("peerconnection", connection);

        connection.addEventListener("track", ev => {
            const track = ev.track;
            if (track.kind === "audio") {
                this.onTrack(track);
            }
        });
    }

    private onTrack(track: MediaStreamTrack) {
        if (this.sink) {
            this.sink.removeAllListeners();
            this.sink.stop();
            this.sink = null;
        }

        this.track = track;
        this.sink = new WebRTC.nonstandard.RTCAudioSink(track);

        this.buffer = [];
        this.bufferSize = 0;
        this.sink.addEventListener('data', this.onAudioData.bind(this));
    }

    private onAudioData(data: AudioData) {
        this.buffer.push(data);
        this.bufferSize += data.samples.length;

        while (this.bufferSize > this.bufferLimit && this.buffer.length > 0) {
            const removed = this.buffer.shift();
            this.bufferSize -= removed.samples.length;
        }

        // Send to connected peers
        for (const peer of this.members.values()) {
            if (peer.connected) {
                peer.sendData(data);
            }
        }
    }

    public addOutgoing(identity: string, s: WalkieOutgoingSession) {
        this.pendingMembers.delete(identity);

        this.members.set(identity, s);

        s.on("close", this.onOutgoingClosed.bind(this));
        s.on("connected", this.onOutgoingConnected.bind(this));
    }

    private onOutgoingConnected(out: WalkieOutgoingSession) {
        // Send buffer
        this.pendingConnected.delete(out.identity);
        this.buffer.forEach(data => {
            out.sendData(data);
        });

        if (this.ended && this.pendingConnected.size === 0) {
            this.onFinished();
        }
    }

    private onOutgoingClosed(out: WalkieOutgoingSession, cause: string) {
        this.emit("member-closed", out, cause);
        this.pendingConnected.delete(out.identity);

        if (this.ended && this.pendingConnected.size === 0) {
            this.onFinished();
        }
    }

    private onFinished() {
        this.members.forEach((value, key) => {
            value.close();
        });
        this.members.clear();
        this.emit("finish", this);
    }
}
