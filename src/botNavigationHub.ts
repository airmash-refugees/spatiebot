declare const config: any;

import { Spatie } from "./spatie";

class BotNavigationHub {
    public isReady: boolean;

    private worker: Worker;
    private findPathCallback: (path: any) => void;
    private errorCallback: (error: any) => void;
    private lastRequestID: number;

    constructor() {
        this.worker = new Worker("__appworker__"); // replaced by build step in webpack
        // (worker code is found in appworker.ts)

        // config.doodads contains info about all mountains
        const mountains = config.doodads.map(x => {
            return {
                x: x[0],
                y: x[1],
                scale: x[3]
            };
        });

        this.worker.postMessage(["setMountains", mountains]);
        this.worker.onmessage = (e) => this.onWorkerMessage(e);
        this.worker.onerror = (e) => this.onError(e);
    }

    public findPath(myPos: any, otherPos: any, callback: (path: any) => void, errorCallback: (error: any) => void): void {

        if (!this.isReady) {
            // wait for other action to be finished
            return;
        }

        this.lastRequestID++;

        this.findPathCallback = callback;
        this.errorCallback = errorCallback;
        this.worker.postMessage(["findPath", { x: myPos.x, y: myPos.y }, { x: otherPos.x, y: otherPos.y }, this.lastRequestID]);
    }

    destroy(): any {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }

    private onWorkerMessage(e: any) {

        const args = e.data as any[];
        const action = args[0];

        if (action === "ERROR") {
            Spatie.log("Error calling worker.");
            this.onError(args.slice(1));
        } else if (action === "READY") {
            this.isReady = true;
        } else if (action === "LOG") {
            console.log(...args.slice(1));
        } else if (action === "findPath") {
            const path = args[1];
            const requestID = args[2];

            if (requestID === this.lastRequestID) {
                const callback = this.findPathCallback;
                this.findPathCallback = null;
                this.errorCallback = null;

                callback(path);
            }
        }
    }

    private onError(error: any) {
        const errorCallback = this.errorCallback;
        this.errorCallback = null;
        this.findPathCallback = null;

        if (errorCallback) {
            errorCallback(error);
        }
    }
}

(<any>window).BotNavigationClient = BotNavigationHub;
export { BotNavigationHub };