import { BotNavigation } from "./botNavigation";

const botNavigation = new BotNavigation();
onmessage = function (event: any) {
    const args = event.data as any[];
    const action = args[0];

    const pm = <any>self.postMessage;  // typescript binding is not helping here

    try {

        if (action === "findPath") {
            const myPos = args[1];
            const otherPos = args[2];
            const requestID = args[3];
            const path = botNavigation.findPath(myPos, otherPos);

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
        pm(["LOG", "error!", err.message]);
        pm(["ERROR"]);
    }
};
