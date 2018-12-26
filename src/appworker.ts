import { BotNavigation } from "./botNavigation";

const botNavigation = new BotNavigation();
onmessage = function (event: any) {
    const args = event.data as any[];
    const action = args[0];

    const pm = <any>self.postMessage;  // typescript binding is not helping here

    botNavigation.setLogFunction(log);
    botNavigation.setSignalAliveFunction(signalAlive);

    try {

        if (action === "findPath") {
            const myPos = args[1];
            const otherPos = args[2];
            const requestID = args[3];

            const path = botNavigation.findPath(myPos, otherPos, requestID);

            // callback
            pm(["findPath", path, requestID]);
        } else if (action === "setMountains") {
            const mountains = args[1];
            botNavigation.setMountains(mountains);
            pm(["READY"]);
        } else {
            pm(["ERROR", "unknown action " + action]);
        }
    } catch (err) {
        log("error:" + err.message);
        pm(["ERROR"]);
    }

    function log(what: string): void {
        pm(["LOG", what]);
    }
    function signalAlive(): void {
        pm(["SIGNAL_ALIVE"]);
    }
};
