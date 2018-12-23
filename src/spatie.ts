declare var Players: any;
declare var Network: any;
declare var game: any;

const Spatie = {
    announce: function (what: string) {
        Spatie.log("Announce: " + what);
        Network.sendChat(what);
    },
    calcDiff: function (first: any, second: any) {
        const diffX = second.x - first.x;
        const diffY = second.y - first.y;
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
    getDeltaTo: function (what: any) {
        what = what || this.state.victim;

        // accuracy
        let victimPos = Spatie.getPosition(what);
        const myPos = Players.getMe().pos;

        const delta = {
            ...Spatie.calcDiff(myPos, victimPos),
            isAccurate: victimPos.isAccurate
        };

        return delta;
    },
    getPosition: function (what: any) {
        // accuracy
        let isAccurate = true;
        let pos = what.pos;
        if (what.lowResPos) {
            isAccurate = Spatie.calcDiff(what.lowResPos, what.pos).distance < 900;
            pos = isAccurate ? pos : what.lowResPos;
        }

        return {
            x: pos.x,
            y: pos.y,
            isAccurate
        };
    },
    getHostilePlayersSortedByDistance: function (excludeID: number = null, includeIDs: number[] = null) {
        const allPlayers = Spatie.getPlayers();
        const players = allPlayers.filter(p =>
            p.team !== game.myTeam && p.id !== excludeID && (!includeIDs || includeIDs.indexOf(p.id) > -1)
        );

        players.sort((victimA, victimB) => {
            const a = this.getDeltaTo(victimA);
            const b = this.getDeltaTo(victimB);

            if (a.isAccurate && !b.isAccurate) {
                return -1;
            }
            if (!a.isAccurate && b.isAccurate) {
                return 1;
            }

            if (a.distance < b.distance) {
                return -1;
            }
            if (b.distance < a.distance) {
                return 1;
            }

            return 0;
        });

        return players;
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
        const sp = <any>Spatie;
        if (Spatie.shouldLog) {
            if (!sp.logger) {
                sp.logger = document.createElement("div");
                document.body.appendChild(sp.logger);
                sp.logger.style = "position: absolute; top: 50px; left: 300px; color: white: width: 600px; height: 500px; overflow: scroll";
            }
            const line = document.createElement("div");
            line.innerText = what;
            sp.logger.insertBefore(line, sp.logger.firstChild);

            if (sp.logger.childElementCount > 100) {
                sp.logger.removeChild(sp.logger.lastChild);
            }

        } else {
            if (sp.logger) {
                document.body.removeChild(sp.logger);
                sp.logger = null;
            }
        }
        if (Spatie.shouldLogToConsole) {
            console.log(what);
        }

    },
    shouldLog: false,
    shouldLogToConsole: false,
};
export { Spatie };