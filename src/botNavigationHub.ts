declare const config: any;

import { Spatie } from "./spatie";

class BotNavigationHub {

    private worker: Worker;
    private findPathCallback: (path: any) => void;

    constructor() {
        this.worker = new Worker("__replace_with_blob__"); // replaced by build step in webpack

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
    }

    public findPath(myPos: any, otherPos: any, callback: (path: any) => void): void {

        if (this.findPathCallback) {
            // wait for other action to be finished
            return;
        }

        this.findPathCallback = callback;
        this.worker.postMessage(["findPath", myPos, otherPos]);
    }

    private onWorkerMessage(e: any) {

        const callback = this.findPathCallback;
        this.findPathCallback = null;

        const args = e.data as any[];
        const action = args[0];

        if (action === "ERROR") {
            console.log(args.slice(1));
            Spatie.log("Error calling worker: " + args.slice(1));
        } else if (action === "findPath") {
            const path = args[1];
            callback(path);
        }
    }
}

(<any>window).BotNavigationClient = BotNavigationHub;
export { BotNavigationHub };