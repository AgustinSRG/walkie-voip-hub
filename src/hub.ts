// Walkie hub

"use strict";

import { Config } from "./config";
import { Walkie } from "./walkie";

/**
 * Manages the walkies
 */
export class WalkieHub {
    public static instance: WalkieHub;

    public static getInstance() {
        if (WalkieHub.instance) {
            return WalkieHub.instance;
        }

        WalkieHub.instance = new WalkieHub();

        return WalkieHub.instance;
    }

    private walkies: Map<string, Walkie>; // Maps id to walkie

    constructor() {
        this.walkies = new Map();
    }

    public async start() {
        for (const walkieConf of Config.getInstance().walkies) {
            if (this.walkies.has(walkieConf.id)) {
                console.log(`[WARNING] Could not create walkie. id=${walkieConf.id}, reason=ID already in use.`);
                continue;
            }

            // Create walkie
            const walkie = new Walkie(walkieConf);
            this.walkies.set(walkieConf.id, walkie);

            if (Config.getInstance().logEvents) {
                console.log(`[INFO] Created walkie: ${walkieConf.id}`);
            }

            // Start walkie
            walkie.start();
        }
    }
}
