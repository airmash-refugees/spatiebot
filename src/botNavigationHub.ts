declare const config: any;

import { Spatie } from "./spatie";

class BotNavigationHub {
    private worker: Worker;
    private isWorkerReady: boolean;
    private findPathCallback: (path: any) => void;
    private errorCallback: (error: any) => void;

    constructor() {
        this.worker = new Worker("__replace_with_blob__"); // replaced by build step in webpack
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
        this.worker.onerror = (e) => console.log("Worker error!", e);
    }

    public findPath(myPos: any, otherPos: any, callback: (path: any) => void, errorCallback: (error: any) => void): void {

        if (this.findPathCallback || !this.isWorkerReady) {
            // wait for other action to be finished
            return;
        }

        this.findPathCallback = callback;
        this.errorCallback = errorCallback;
        this.worker.postMessage(["findPath", { x: myPos.x, y: myPos.y }, { x: otherPos.x, y: otherPos.y }]);
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

            const errorCallback = this.errorCallback;
            this.errorCallback = null;
            this.findPathCallback = null;

            errorCallback(args.slice(1));
        } else if (action === "READY") {
            this.isWorkerReady = true;
        } else if (action === "LOG") {
            console.log(...args.slice(1));
        } else if (action === "findPath") {
            const callback = this.findPathCallback;
            this.findPathCallback = null;
            this.errorCallback = null;

            const path = args[1];
            callback(path);
        }
    }
}

(<any>window).BotNavigationClient = BotNavigationHub;
export { BotNavigationHub };