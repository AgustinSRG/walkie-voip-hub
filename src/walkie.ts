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
        this.incomingSessions = new Map();
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

        this.logEvent(`Session. local=${session.local_identity.uri.toString()}, remote=${session.remote_identity.uri.toString()}`);

        if (session.direction === "incoming") {
            this.onIncomingSession(session, session.remote_identity.uri.toString());
        }
    }

    private onIncomingSession(session: RTCSession, identity: string) {
        if (!this.memberSet.has(identity)) {
            session.terminate();
            this.logEvent(`Session closed. direction=${session.direction}, identity=${identity}, reason=Not in the members list`);
            return;
        }

        this.nextId++;

        const id = this.nextId + "";

        this.logEvent(`Input session started. id=${id}, identity=${identity}`);

        const s = new WalkieIncomingSession(session, id, this.memberSet);

        this.incomingSessions.set(id, s);

        s.on("finish", () => {
            this.incomingSessions.delete(id);
            this.logEvent(`Input session ended. id=${id}, identity=${identity}`);
        });

        s.on("open", () => {
            this.logEvent(`Input session openned. id=${id}, identity=${identity}`);
        });

        s.on("close", (cause: string) => {
            this.logEvent(`Session closed. direction=${session.direction}, identity=${identity}, reason=${cause}`);
        });

        s.on("member-closed", (out: WalkieOutgoingSession, cause: string) => {
            this.logEvent(`Output session closed. input-id=${s.id}, output-identity=${out.identity}, cause=${cause}`);
        });

        s.start();

        // Call other peers
        for (const memberToCall of s.pendingMembers) {
            const outG = new WalkieOutgoingSession(memberToCall);
            const outSession = this.phone.call(memberToCall,
                {
                    mediaStream: outG.getMediaStream(),
                    mediaConstraints: {
                        audio: true, video: false
                    },
                    /*pcConfig: {
                        iceServers: [
                            {
                                "urls": "stun:stun.l.google.com:19302"
                            }
                        ]
                    },*/
                }
            );
            this.logEvent(`Output session created. input-id=${s.id}, output-identity=${outG.identity}`);
            s.addOutgoing(memberToCall, outG);
            outG.start(outSession);

            outG.on("open", () => {
                this.logEvent(`Output session openned. input-id=${s.id}, output-identity=${outG.identity}`);
            });

            outG.on("connected", () => {
                this.logEvent(`Output session connected. input-id=${s.id}, output-identity=${outG.identity}`);
            });
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
