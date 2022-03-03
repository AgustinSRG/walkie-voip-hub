// Configuration

"use strict";

import dotenv from "dotenv";
import { readFileSync } from "fs";

dotenv.config(); // Load env variables

export interface WalkieConfig {
    id: string;
    ws: string;
    uri: string;
    password: string;
    members: string[];
}

/**
 * Configuration class
 */
export class Config {

    public static instance: Config;

    public static getInstance() {
        if (Config.instance) {
            return Config.instance;
        }

        Config.instance = new Config();

        return Config.instance;
    }

    public groupsFile: string;
    public walkies: WalkieConfig[];

    public bufferLength: number;

    public logEvents: boolean;
    public logDebug: boolean;
    public logType: number;

    constructor() {
        this.groupsFile = process.env.GROUPS_CONFIG_FILE || "groups.json";

        this.walkies = JSON.parse(readFileSync(this.groupsFile).toString());

        this.bufferLength = parseInt(process.env.BUFFER_LENGTH_MB || "16") || 0;

        const logMode = process.env.LOG_MODE + "";

        switch (logMode.toUpperCase()) {
        case "SILENT":
            this.logEvents = false;
            this.logDebug = false;
            this.logType = 1;
            break;
        case "DEBUG":
            this.logEvents = true;
            this.logDebug = true;
            this.logType = 3;
            break;
        default:
            this.logEvents = true;
            this.logDebug = false;
            this.logType = 2;
        }
    }
}
