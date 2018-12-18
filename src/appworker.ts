import { BotNavigation } from "./botNavigation";

const botNavigation = new BotNavigation();
onmessage = function (event: any) {
    const args = event.data as any[];
    const action = args[0];

    const pm = <any>self.postMessage;  // typescript binding is not helping here

    if (action === "findPath") {
        const myPos = args[1];
        const otherPos = args[2];

        try {
            const path = botNavigation.findPath(myPos, otherPos);
            pm(["findPath", path]);
        } catch (err) {
            pm(["ERROR", JSON.stringify(err, Object.getOwnPropertyNames(err))]);
        }
    } else if (action === "setMountains") {
        const mountains = args[1];
        botNavigation.setMountains(mountains);
    } else {
        pm(["ERROR", "unknown action " + action]);
    }
};
