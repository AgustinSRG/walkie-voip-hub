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

    constructor(session: RTCSession) {
        super();

        this.ended = false;
        this.session = session;
        this.identity = session.remote_identity.uri.toString();
    }

    public start() {
        this.source = new WebRTC.nonstandard.RTCAudioSource();
        this.track = this.source.createTrack();

        this.session.on("ended", this.onSessionClose.bind(this));
        this.session.on("failed", this.onSessionClose.bind(this));

        this.session.on("confirmed", this.onCallConfirmed.bind(this));
        this.session.on("peerconnection", this.onPeerConnection.bind(this));
    }

    public destroy() {
        this.ended = true;
        this.track.stop();
        this.source.close();
        this.session.removeAllListeners();
        this.session.terminate();
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
        setTimeout(this.destroy.bind(this), 2000);
    }

    private onSessionClose(ev: any) {
        this.destroy();
        this.emit("close", this, ev.cause || "undetermined");
    }

    private onCallConfirmed() {
        this.emit("open");
    }

    private onPeerConnection(ev: PeerConnectionEvent) {
        const connection = ev.peerconnection;
        connection.addTrack(this.track);
        this.connected = true;
        this.emit("connected", this);
    }
}
