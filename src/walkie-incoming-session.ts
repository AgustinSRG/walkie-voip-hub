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

    public track: MediaStreamTrack;
    public sink: WebRTC.nonstandard.RTCAudioSink;

    public pendingMembers: Set<string>;
    public pendingConnected: Set<string>;

    public members: Map<string, WalkieOutgoingSession>;

    public id: string;
    public ended: boolean;

    private lastRateMsg: number;
    private byteCount: number;

    constructor(session: RTCSession, id: string, members: Set<string>) {
        super();

        this.id = id;
        this.session = session;
        this.identity = session.remote_identity.uri.toString();

        this.pendingMembers = new Set();
        this.pendingConnected = new Set();
        this.members = new Map();

        for (const member of members) {
            if (this.identity !== member) {
                this.pendingMembers.add(member);
                this.pendingConnected.add(member);
            }
        }

        this.ended = false;
        this.lastRateMsg = Date.now();
        this.byteCount = 0;
    }

    public start() {
        this.session.on("ended", this.onSessionClose.bind(this));
        this.session.on("failed", this.onSessionClose.bind(this));

        this.session.on("confirmed", this.onCallConfirmed.bind(this));
        this.session.on("peerconnection", this.onPeerConnection.bind(this));

        this.session.answer({
            mediaStream: new MediaStream(),
            /*pcConfig: {
                iceServers: [
                    {
                        "urls": "stun:stun.l.google.com:19302"
                    },
                ]
            },*/
        });
    }

    public destroy() {
        if (this.sink) {
            this.sink.stop();
            this.sink = null;
        }
        this.ended = true;
        if (this.session.status !== 8) {
            this.session.terminate();
        }
    }

    /* Event listeners */

    private onSessionClose(ev: any) {
        this.destroy();
        this.emit("close", ev.cause || "undetermined");

        if (this.pendingConnected.size === 0) {
            this.onFinished();
        }
    }

    private onCallConfirmed() {
        this.emit("open");
        this.lastRateMsg = Date.now();
        this.byteCount = 0;
    }

    private onPeerConnection(ev: PeerConnectionEvent) {
        const connection = ev.peerconnection;

        this.emit("peerconnection", connection);

        connection.getReceivers().forEach((receiver) => {
            const track = receiver.track;
            if (track.kind === "audio") {
                this.onTrack(track);
            }
        });

        connection.ontrack = (ev: RTCTrackEvent) => {
            const track = ev.track;
            // console.log("On track 2: " + track.kind);
            if (track.kind === "audio") {
                this.onTrack(track);
            }
        };
    }

    private onTrack(track: MediaStreamTrack) {
        if (this.sink) {
            this.sink.stop();
            this.sink = null;
        }

        this.track = track;
        this.sink = new WebRTC.nonstandard.RTCAudioSink(track);
        this.sink.addEventListener('data', this.onAudioData.bind(this));
    }

    private onAudioData(data: AudioData) {
        const now = Date.now();
        this.byteCount += data.samples.length;

        if (Date.now() - this.lastRateMsg > 5000) {
            const bitrate = this.byteCount / ((Date.now() - this.lastRateMsg) / 1000);
            this.emit("bitrate", bitrate);
            this.byteCount = 0;
            this.lastRateMsg = Date.now();
        }

        // Send to connected peers
        for (const peer of this.members.values()) {
            peer.addData(data, now);
        }
    }

    public addOutgoing(identity: string, s: WalkieOutgoingSession) {
        this.pendingMembers.delete(identity);

        this.members.set(identity, s);

        s.on("close", this.onOutgoingClosed.bind(this));
        s.on("connected", this.onOutgoingConnected.bind(this));
    }

    private onOutgoingConnected(out: WalkieOutgoingSession) {
        this.pendingConnected.delete(out.identity);

        if (this.ended && this.pendingConnected.size === 0) {
            this.onFinished();
        }
    }

    private onOutgoingClosed(out: WalkieOutgoingSession, cause: string) {
        this.emit("member-closed", out, cause);
        this.pendingConnected.delete(out.identity);
        this.members.delete(out.identity);

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
