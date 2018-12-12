declare var Players: any;
declare var Network: any;

const Spatie = {
    announce: function (what: string) {
        Spatie.log("Announce: " + what);
        Network.sendChat(what);
    },
    calcDiff: function (first: any, second: any) {
        const diffX = second.x - first.x;
        const diffY = first.y - second.y;
        const distance = Math.sqrt(diffX * diffX + diffY * diffY);
        return {
            diffX,
            diffY,
            distance,
        };
    },
    decodeHtml: function (html: string) {
        var sp = <any>Spatie;
        sp.htmlDecodeHelper = sp.htmlDecodeHelper || document.createElement("textarea");
        sp.htmlDecodeHelper.innerHTML = html;
        return sp.htmlDecodeHelper.value;
    },
    getPlayers: function () {
        const result = [];
        const playerIDs = Players.getIDs();
        for (let id in playerIDs) {
            if (playerIDs.hasOwnProperty(id)) {
                const p = Players.get(id);
                if (p) {
                    result.push(p);
                }
            }
        }
        return result;
    },
    getRandomNumber: function (lower: number, upper: number) {
        return lower + Math.floor(Math.random() * (upper - lower));
    },
    log: function (what: string) {
        if (Spatie.shouldLog) {
            const sp = <any>Spatie;
            if (!sp.logger) {
                sp.logger = document.createElement("textarea");
                document.body.appendChild(sp.logger);
                sp.logger.style = "position: absolute; top: 1px; left: 1px;";
            }
            sp.logger.innerHTML = what + "\n" + sp.logger.innerHTML;
        }
    },
    shouldLog: false,
};
export {Spatie};