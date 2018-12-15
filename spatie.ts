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
    getDeltaTo: function(what: any) {
        what = what || this.state.victim;

        // accuracy
        let isAccurate = true;
        let victimPos = what.pos;
        if (what.lowResPos) {
            isAccurate = Spatie.calcDiff(what.lowResPos, what.pos).distance < 450;
            victimPos = isAccurate ? victimPos : what.lowResPos;
        }

        const myPos = Players.getMe().pos;

        const delta = {
            ...Spatie.calcDiff(myPos, victimPos),
            isAccurate: isAccurate
        };

        return delta;
    },
    getHostilePlayersSortedByDistance: function(excludeID: number = null) {
        const allPlayers = Spatie.getPlayers();
        const players = allPlayers.filter(p =>
            p.team !== game.myTeam && p.id !== excludeID
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
export { Spatie };