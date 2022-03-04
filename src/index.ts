// Streaming master server

"use strict";

import { Config } from './config';
import { CrashGuard } from './crash-guard';
import WebRTC from "wrtc";
import { WalkieHub } from './hub';

global.window = <any>{
    MediaStream: WebRTC.MediaStream,
    RTCPeerConnection: WebRTC.RTCPeerConnection,
    RTCSessionDescription: WebRTC.RTCSessionDescription,
};

for (const k of Object.keys(global.window)) {
    global[k] = global.window[k];
}

function main() {
    Config.getInstance();

    WalkieHub.getInstance().start().catch(err => {
        console.error(err);
    });

    CrashGuard.enable();
}

main();
