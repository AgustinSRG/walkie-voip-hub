// Walkie controller

"use strict";

import JsSIP from 'jssip';
import NodeWebSocket from 'jssip-node-websocket';
import { RTCSession } from 'jssip/lib/RTCSession';
import { RTCSessionEvent } from 'jssip/lib/UA';
import { Config, WalkieConfig } from './config';
import { WalkieIncomingSession } from './walkie-incoming-session';
import { WalkieOutgoingSession } from './walkie-outgoing-session';

export class Walkie {

    public config: WalkieConfig;

    public memberSet: Set<string>;

    public phone: JsSIP.UA;
    public socket: NodeWebSocket;

    public nextId: number;

    public incomingSessions: Map<string, WalkieIncomingSession>;

    constructor(config: WalkieConfig) {
        this.config = config;
        this.memberSet = new Set(config.members);
        this.nextId = 0;
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
        this.logEvent(`Session. direction=${session.direction}, identity=${remoteId}`);

        if (session.direction === "incoming") {
            this.onIncomingSession(session);
        }
    }

    private onIncomingSession(session: RTCSession) {
        const remoteId = session.remote_identity.uri.toString();
        if (!this.memberSet.has(remoteId)) {
            session.terminate();
            this.logEvent(`Session closed. direction=${session.direction}, identity=${remoteId}, reason=Not in the members list`);
            return;
        }

        this.nextId++;

        const id = this.nextId + "";

        this.logEvent(`Input session started. id=${id}, identity=${remoteId}`);

        const s = new WalkieIncomingSession(session, id, this.memberSet);

        this.incomingSessions.set(id, s);

        s.on("finish", () => {
            this.incomingSessions.delete(id);
            this.logEvent(`Input session ended. id=${id}, identity=${remoteId}`);
        });

        s.on("open", () => {
            this.logEvent(`Input session openned. id=${id}, identity=${remoteId}`);
        });

        s.on("close", (cause: string) => {
            this.logEvent(`Session closed. direction=${session.direction}, identity=${remoteId}, reason=${cause}`);
        });

        s.on("member-closed", (out: WalkieOutgoingSession, cause: string) => {
            this.logEvent(`Output session created. input-id=${s.id}, output-identity=${out.identity}, cause=${cause}`);
        });

        s.start();

        // Call other peers
        for (const memberToCall of s.pendingMembers) {
            const outG = new WalkieOutgoingSession(memberToCall);
            this.phone.call(memberToCall, { mediaStream: outG.getMediaStream() });
            this.logEvent(`Output session created. input-id=${s.id}, output-identity=${remoteId}`);
            s.addOutgoing(remoteId, outG);
        }
    }

    /* Private methods */

    /**
     * Clears the phone data
     */
    private clear() {
        if (this.phone) {
            this.phone.removeAllListeners();
            this.phone = null;
        }
        if (this.socket) {
            try {
                this.socket.disconnect();
            } catch (ex) { }
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
