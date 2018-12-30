declare const Players: any;
declare const game: any;

import { SpatiebotState } from "./spatiebotState";
import { Spatie } from "./spatie";
import { BotConfig } from "./botConfigFactory";
import { PlayerStat } from "./playerStat";

class SpatiebotVictimSelection {

    constructor(private state: SpatiebotState, private config: BotConfig, private playerStats: PlayerStat[]) {
    }

    public selectVictim() {
        if (this.config.protectHomeBase) {
            this.selectVictimDefensively();
        } else {
            this.selectVictimOffensively();
        }
    }

    private selectVictimDefensively() {
        const currentVictim = this.state.victim;
        this.state.victim = null; // always drop the victim by default.

        // always choose flag carrier as victim if there is one
        const flagCarrier = this.targetFlagCarrier();
        if (flagCarrier && this.isVictimValid(flagCarrier)) {
            this.state.victim = flagCarrier;
        } else {
            const agressivePlayers = Spatie.getHostilePlayersSortedByDistance()
                .filter(x => this.isVictimValid(x));

            if (agressivePlayers.length > 0) {
                // only if they are a certain range from home base
                const closestPlayer = agressivePlayers[0];
                const playerPos = Spatie.getPosition(closestPlayer);
                const delta = Spatie.calcDiff(this.config.homeBase.pos, playerPos);
                if (delta.distance < 2000) {
                    this.state.victim = closestPlayer;
                }
            }
        }

        if (currentVictim !== this.state.victim && this.state.victim) {
            Spatie.log("New victim: " + this.state.victim.name);
            this.state.pathToVictim = null;
        }

    }

    private selectVictimOffensively() {
        const currentVictim = this.state.victim;

        let victim = this.getBestVictim();

        // choose a new victim if no victim selected
        victim = victim || this.chooseNextVictim();

        const changedTarget = !this.isSamePlayer(currentVictim, victim);

        if (changedTarget) {
            if (currentVictim) {
                Spatie.log("Dropped victim " + currentVictim.name);
            }

            if (victim) {
                Spatie.log("Chose new victim " + victim.name);
                this.state.lastTimeVictimWasChosen = Date.now();
                this.state.pathToVictim = null;
            }

            if (!victim || this.state.hasLockOnTarget !== victim.id) {
                this.state.hasLockOnTarget = null;
            }
        }

        // keep the last victim, or if no victim was chosen,
        // remove the id, to be able to reselect the previous
        // victim again if there's only 1 other player
        this.state.previousVictimID = victim ? victim.id : null;

        // also remove the bonding if no victim was chosen: apparently only spatiebots are in the game
        if (!victim) {
            this.config.bondingTimes = 0;
        }

        // always refresh victim object
        this.state.victim = victim ? Players.get(victim.id) : null;
    }

    private isSamePlayer(a: any, b: any): boolean {
        if (a && !b || !a && b) {
            return false;
        }
        if (!a && !b) {
            return true;
        }

        return a.id === b.id;
    }

    private getBestVictim() {
        // always choose flag carrier as victim if there is one
        const flagCarrier = this.targetFlagCarrier();
        if (flagCarrier && this.isVictimValid(flagCarrier)) {
            return flagCarrier;
        }

        // use the suggested target
        const suggested = this.takeOverSuggestion();
        if (suggested && this.isVictimValid(suggested)) {
            Spatie.log("Take over suggested");
            return suggested;
        }

        // get the currently selected victim
        const victim = this.state.victim;

        if (!victim) {
            return;
        }

        if (!this.isVictimValid(victim)) {
            // drop victim, take another ones
            Spatie.log("Victim not active, or prowler, or spactating, or expired, or immune");
            return null;
        }

        // if this victim is the locked target, don't reconsider here
        if (this.state.hasLockOnTarget === victim.id) {
            return victim;
        }

        // otherwise, find a target that is closer by
        const closerBy = this.findVictimCloserByThan(victim);
        if (closerBy) {
            return closerBy;
        }

        return victim;
    }

    private getClosestValidPlayer() {
        const players = Spatie.getHostilePlayersSortedByDistance();

        let index = 0;
        while (true) {
            const closestHostilePlayer = players[index];

            if (!closestHostilePlayer) {
                return null;
            }

            if (this.isVictimValid(closestHostilePlayer)) {
                return closestHostilePlayer;
            }

            index++;
        }
    }

    private findVictimCloserByThan(currentVictim: any) {
        // if there are other players closer by, consider chasing them
        const closestHostilePlayer = this.getClosestValidPlayer();
        if (closestHostilePlayer.id !== currentVictim.id) {
            const victimDistance = Spatie.getDeltaTo(currentVictim);
            const closestPlayerDistance = Spatie.getDeltaTo(closestHostilePlayer);

            let shouldSwitch;
            if (!closestPlayerDistance.isAccurate || victimDistance.distance < this.config.distanceClose) {
                shouldSwitch = false;
            } else if (closestPlayerDistance.isAccurate && !victimDistance.isAccurate) {
                Spatie.log("switch: " + closestHostilePlayer.name + " is more accurate");
                shouldSwitch = true;
            } else if (closestPlayerDistance.distance / victimDistance.distance < 0.2) {
                Spatie.log("switch: " + closestHostilePlayer.name + " is way closer");
                shouldSwitch = true;
            }

            if (shouldSwitch) {
                return closestHostilePlayer;
            }
        }

        return null;
    }

    private isVictimValid(victim: any) {
        const elapsedMsSinceLastChosenVictim = Date.now() - this.state.lastTimeVictimWasChosen;

        const isActive = !!Players.get(victim.id);
        const isSpectating = victim.removedFromMap;
        const isProwler = victim.type === 5;
        const isVictimImmune = !!/^test.*/.exec(victim.name) ||
            (this.config.bondingTimes > 0 && !!/^.+Bot.*/.exec(victim.name));

        let isExpired;
        if (this.state.lastTimeVictimWasChosen) {
            isExpired = elapsedMsSinceLastChosenVictim > this.config.victimExpireMs;
        }

        if (!isActive || isProwler || isSpectating || isExpired || isVictimImmune) {
            return false;
        }

        return true;
    }

    private chooseNextVictim() {
        const players = Spatie.getHostilePlayersSortedByDistance(this.state.previousVictimID);

        // take the nearest player
        const victim = players[0];

        return victim;
    }

    private targetFlagCarrier() {
        if (this.state.flagCarrierID) {
            return Players.get(this.state.flagCarrierID);
        }
        return null;
    }

    private takeOverSuggestion() {
        if (!this.state.suggestedVictimID) {
            return null;
        }

        const suggestedVictim = Players.get(this.state.suggestedVictimID);
        if (!suggestedVictim) {
            return null;
        }

        const randomNumber = Spatie.getRandomNumber(0, 4);

        let newVictim;
        if (randomNumber === 0 && this.state.suggestingPlayerID !== game.myID) {
            // turn agains suggestor
            const suggestingPlayer = Players.get(this.state.suggestingPlayerID);
            newVictim = suggestingPlayer;
        } else {
            // take over suggestion
            newVictim = suggestedVictim;
        }

        if (newVictim) {
            Spatie.announce("ok, lock on target: " + newVictim.name);
        }

        this.state.suggestedVictimID = null;
        this.state.suggestingPlayerID = null;
        this.state.hasLockOnTarget = newVictim.id;

        return newVictim;
    }
}

export { SpatiebotVictimSelection };