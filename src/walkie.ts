// Walkie controller

"use strict";

import JsSIP from 'jssip';
import NodeWebSocket from 'jssip-node-websocket';
import { RTCSessionEvent } from 'jssip/lib/UA';
import { Config, WalkieConfig } from './config';

const callOptions = {
    mediaConstraints: {
        audio: true, // only audio calls
        video: false
    }
};

export class Walkie {

    public config: WalkieConfig;
    public phone: JsSIP.UA;
    public socket: NodeWebSocket;

    constructor(config: WalkieConfig) {
        this.config = config;
    }

    public start() {
        this.clear();
        this.logEvent("Registering phone...");
        this.socket = new NodeWebSocket(this.config.ws);
        this.phone = new JsSIP.UA({
            uri: this.config.uri,
            password: this.config.password,
            display_name: this.config.id,
            sockets: [this.socket]
        });

        this.phone.start();

        this.phone.on("connected", this.onPhoneConnected.bind(this));
        this.phone.on("disconnected", this.onPhoneDisconnected.bind(this));
        this.phone.on("registrationFailed", this.onPhoneRegistrationFailed.bind(this));
        this.phone.on("unregistered", this.onPhoneRegistrationFailed.bind(this));
        this.phone.on("registered", this.onPhoneRegistered.bind(this));
        this.phone.on("newRTCSession", this.onRTCSession.bind(this));
    }

    /* Event listeners */

    private onPhoneConnected() {
        this.logEvent("Phone connected");
    }

    private onPhoneRegistered() {
        this.logEvent("Phone successfully registered");
    }

    private onPhoneDisconnected(ev: any) {
        if (!this.phone) {
            return;
        }
        this.clear();
        this.onError("Phone disconnected. Reason: " + (ev.reason || ev.code || "unspecified"));
    }

    private onPhoneRegistrationFailed(ev: any) {
        if (!this.phone) {
            return;
        }
        this.clear();
        this.onError("Phone registration failed. Reason: " + (ev.cause || "unspecified"));
    }

    private onRTCSession(ev: RTCSessionEvent) {
        const session = ev.session;
        const remoteId = session.remote_identity.uri.toString();
        this.logEvent(`Session received. direction=${session.direction}, number=${remoteId}`);
    }

    /* Private methods */

    /**
     * Crears the phone data
     */
    private clear() {
        if (this.phone) {
            this.phone.removeAllListeners();
            this.phone = null;
        }
        if (this.socket) {
            try {
                this.socket.disconnect();
            } catch (ex) {}
            this.socket = null;
        }
    }

    /**
     * Logs an error an retries in 10 seconds
     * @param msg Error message
     */
    private onError(msg: string) {
        this.logError(msg);
        this.logEvent("Retrying in 10 seconds");
        setTimeout(this.start.bind(this), 10000);
    }

    /**
     * Logs message
     * @param str Message
     */
    private log(str: string) {
        console.log(`[Walkie: ${this.config.id}] ${str}`);
    }

    private logEvent(str: string) {
        if (Config.getInstance().logEvents) {
            this.log("[INFO] " + str);
        }
    }

    private logDebug(str: string) {
        if (Config.getInstance().logDebug) {
            this.log("[DEBUG] " + str);
        }
    }

    private logWarning(str: string) {
        this.log("[WARNING] " + str);
    }

    public logError(str: string) {
        this.log("[ERROR] " + str);
    }
}
