// declare airmash and starmash globals
declare var Mobs: any;
declare var Players: any;
declare var Network: any;
declare var game: any;

import { BotConfigFactory } from "./botConfigFactory";
import { Spatie } from "./spatie";
import { SpatiebotState } from "./spatiebotState";
import { SpatiebotCommandExecutor } from "./spatiebotCommandExecutor";

const botConfigFactory = new BotConfigFactory();
const upgradeInfo = {
    availableUpgrades: 0,
    upgradeStats: <any>{}
};

class SpatieBot {

    private config;
    private state: SpatiebotState;
    private commandExecutor: SpatiebotCommandExecutor;
    public upgradeInfo = upgradeInfo;

    public announceTarget() {
        if (!this.isOn()) {
            return;
        }

        const victim = this.state.victim;
        let victimName = victim ? victim.name : "(no target)";
        Spatie.announce("Target: " + victimName);
    }

    public dispose() {
        if (this.state && this.state.heartbeatInterval) {

            clearInterval(this.state.heartbeatInterval);
            this.commandExecutor.clearCommands();

            this.commandExecutor = null;
            this.state = null;
        }
    }

    public initialize() {
        if (this.isOn()) {
            return;
        }

        this.state = new SpatiebotState();
        this.config = botConfigFactory.getConfigByAircraftType(Players.getMe().type);
        this.commandExecutor = new SpatiebotCommandExecutor(this.state, this.config);

        Spatie.log("Starting bot of type " + this.config.name);

        if (this.config.bondingTimes > 0) {
            this.config.bondingTimes = this.config.bondingTimes - 1;
        }

        this.state.heartbeatInterval = setInterval(() => this.heartbeat(), this.config.heartbeatInterval);
    }

    public logState() {
        if (!this.isOn()) {
            Spatie.log("(no state: bot is off)");
            return;
        }

        Spatie.log(JSON.stringify(this.state));
    }

    public onMissileFired(missileID: number) {
        if (!this.isOn()) {
            return;
        }

        // keep track of this missile to flee from it when necessary
        this.state.missileIDs = this.state.missileIDs || [];
        this.state.missileIDs.push(missileID);
    }

    public onMobAdd(playerID: number, mob: any) {
        if (!this.isOn()) {
            return;
        }

        if (playerID === game.myID) {
            return;
        }

        // then call our own event in case of missiles
        const missilesTypes = [
            1, /* pred missile */
            2, /* goliath missile */
            3, /* copter missile */
            5, /* tornado single missile */
            6, /* tornado multiple missile */
            7, /* prowler missile */
        ];
        const powerupTypes = [
            4, // upgrade
            8, // shield
            9, // rampage
        ];

        if (missilesTypes.indexOf(mob.type) > -1) {
            this.onMissileFired(mob.id);
        } else if (powerupTypes.indexOf(mob.type) > -1) {
            this.onPowerupDetected(mob.id);
        }
    }

    public onPlayerKilled(killedID: number, killerID: number) {
        if (!this.isOn()) {
            return;
        }

        if (killedID === game.myID) {
            Spatie.log("I was killed. Restarting.");
            this.dispose();
            setTimeout(() => this.initialize(), this.config.respawnTimeout);
        } else if (this.state.victim && killedID === this.state.victim.id) {
            Spatie.log("Victim was killed, choosing another victim.");
            this.state.victim = null;
        }
    }

    public onPowerupDetected(powerupID: number) {
        if (!this.isOn()) {
            return;
        }
        if (!this.config.goForUpgrades) {
            return;
        }
        this.state.detectedPowerUps = this.state.detectedPowerUps || [];
        this.state.detectedPowerUps.push(powerupID);
    }

    public toggleBonding() {
        if (!this.isOn()) {
            return;
        }

        if (this.config.bondingTimes) {
            this.config.bondingTimes = null;
            Spatie.announce("Every SpatieBot for itself");
        } else {
            this.config.bondingTimes = 3;
            this.state.victim = null;
            Spatie.announce("All SpatieBots, unite!");
        }
    }

    public suggestVictim(playerID: number, suggestedVictim: any) {
        if (!this.isOn()) {
            return;
        }

        const randomNumber = Spatie.getRandomNumber(0, 4);
        let victim;
        let tookOverSuggestion;
        if (randomNumber !== 0) {
            // take over suggestion
            victim = Players.getByName(suggestedVictim);
            if (victim.id !== game.myID) {
                this.state.suggestedVictimID = victim ? victim.id : null;
                tookOverSuggestion = true;
            }
        }

        if (victim) {
            Spatie.announce("ok, new target: " + suggestedVictim);
        } else {
            // suggestion overruled (or player not found)
            this.state.suggestedVictimID = playerID;
            if (!tookOverSuggestion) {
                Spatie.announce("ok, new target: " + Players.get(playerID).name);
            }
        }
    }

    private applyUpgrades() {
        let tooEarly = false;
        if (this.state.lastUpgradeApplicationTime) {
            const elapsedSinceLastApplication = Date.now() - this.state.lastUpgradeApplicationTime;
            tooEarly = elapsedSinceLastApplication < 5000;
        }
        const hasEnoughUpgrades = this.upgradeInfo.availableUpgrades >= 5;
        const hasNoRisk = Players.getMe().health >= 0.9;

        if (!tooEarly && hasEnoughUpgrades && hasNoRisk) {
            let count = 0;
            this.state.lastUpgradeApplicationTime = Date.now();
            const upgradeInterval = setInterval(() => {
                Network.sendCommand("upgrade", this.config.applyUpgradesTo + "");
                count += 1;
                if (count === 5) {
                    clearInterval(upgradeInterval);
                }
            }, 400);
        }
    }

    private approachCoords() {
        const coords = this.state.gotoCoords;
        const poi = { pos: coords };

        this.turnTo(poi);

        const delta = this.getDeltaTo(poi);

        if (delta.distance > this.config.distanceClose) {
            this.setFastMovement(true);
            this.setSpeedMovement("UP");
        } else {
            this.state.gotoCoords = null;
        }
    }

    private approachMob() {

        const powerups = [];
        let closestPowerup;
        for (var i = 0; i < this.state.detectedPowerUps.length; i++) {
            var powerup = Mobs.get(this.state.detectedPowerUps[i]);
            if (powerup) {
                powerups.push(powerup.id);
                powerup.delta = this.getDeltaTo(powerup);
                if (!closestPowerup || closestPowerup.delta.distance > powerup.delta.distance) {
                    closestPowerup = powerup;
                }
            }
        }

        if (closestPowerup) {
            this.turnTo(closestPowerup);

            if (closestPowerup.delta.distance > this.config.distanceTooClose) {
                this.setFastMovement(true);
            }
            this.setSpeedMovement("UP");
        }

        this.state.detectedPowerUps = powerups;
    }

    private approachVictim() {
        const victim = this.state.victim;
        if (!victim) {
            this.setSpeedMovement(null);
            return;
        }

        const delta = this.getDeltaTo(victim);

        var direction;
        this.setFastMovement(false);
        if (this.state.isVictimPoweredUp && delta.distance < this.config.distanceNear && !this.hasShield()) {
            // back off
            direction = "DOWN";
        } else if (delta.distance > this.config.distanceFar) {
            if (Players.getMe().health > this.config.fleeHealthThresholdMax) {
                this.setFastMovement(true);
            }
            direction = "UP";
        } else if (delta.distance > this.config.distanceTooClose) {
            direction = "UP";
        } else {
            // too close
            direction = "DOWN";
        }

        this.setSpeedMovement(direction);
    }

    private chooseNextVictim() {
        const players = this.getHostilePlayersSortedByDistance(this.state.previousVictimID);

        // take the nearest player
        const victim = players[0];

        // keep the last victim, or if no victim was chosen,
        // remove the id, to be able to reselect the previous
        // victim again if there's only 1 other player
        this.state.previousVictimID = victim ? victim.id : null;

        // also remove the bonding if no victim was chosen: apparently only spatiebots are in the game
        if (!victim) {
            this.config.bondingTimes = 0;
        }

        return victim;
    }

    private detectFlagTaken() {
        this.state.flagCarrierID = null;
        const blueFlagCarrierName = getPlayerName($("#blueflag-name").html());
        const redFlagCarrierName = getPlayerName($("#redflag-name").html());

        if (blueFlagCarrierName || redFlagCarrierName) {
            const me = Players.getMe();
            const redPlayer = Players.getByName(blueFlagCarrierName);
            if (redPlayer && redPlayer.team !== me.team) {
                this.state.flagCarrierID = redPlayer.id;
            }
            const bluePlayer = Players.getByName(redFlagCarrierName);
            if (bluePlayer && bluePlayer.team !== me.team) {
                this.state.flagCarrierID = bluePlayer.id;
            }
        }

        function getPlayerName(raw: string) {
            const m = /([^<]+)</.exec(raw);
            if (m) {
                return Spatie.decodeHtml(m[1]);
            }
            return null;
        }
    }

    private detectDangerousObjects() {
        this.state.objectToFleeFromID = null;

        if (this.hasShield()) {
            return;
        }

        // detect dangerous missiles
        const missileIDs = this.state.missileIDs || [];
        this.state.missileIDs = [];
        const activeMissiles = [];
        for (let i = 0; i < missileIDs.length; i++) {
            const missile = Mobs.get(missileIDs[i]);
            if (missile) {
                activeMissiles.push(missile);
                missile.delta = null;
            }
        }

        const dangerFactorForHealth = this.config.fleeHealthThresholdMax / Players.getMe().health;

        if (activeMissiles.length > 0) {
            const myPos = Players.getMe().pos;
            activeMissiles.sort((a, b) => {
                let deltaA = a.delta || Spatie.calcDiff(myPos, a.pos);
                let deltaB = b.delta || Spatie.calcDiff(myPos, b.pos);
                a.delta = deltaA;
                b.delta = deltaB;

                if (deltaA.distance < deltaB.distance) {
                    return -1;
                } else if (deltaB.distance < deltaA.distance) {
                    return 1;
                }
                return 0;
            });
            const nearestMissile = activeMissiles[0];
            const delta = nearestMissile.delta || Spatie.calcDiff(myPos, nearestMissile.pos);

            const dangerFactorForMissile = nearestMissile.exhaust / 18; // = heli missile exhaust
            const dangerDistance = this.config.distanceMissileDangerous * dangerFactorForMissile * dangerFactorForHealth;

            if (delta.distance < dangerDistance) {
                this.state.objectToFleeFromID = nearestMissile.id;
            }
        }

        const activeMissileIDs = activeMissiles.map(x => x.id);
        for (var i = 0; i < activeMissileIDs.length; i++) {
            this.state.missileIDs.push(activeMissileIDs[i]);
        }

        // detect nearby enemies
        if (!this.state.objectToFleeFromID) {
            const victimID = this.state.victim ? this.state.victim.id : null;
            const closestEnemy = this.getHostilePlayersSortedByDistance(victimID)[0];
            if (closestEnemy) {
                const delta = this.getDeltaTo(closestEnemy);
                const dangerDistance = dangerFactorForHealth * this.config.distanceTooClose;
                if (delta.isAccurate && delta.distance < dangerDistance) {
                    this.state.objectToFleeFromID = closestEnemy.id;
                }
            }
        }
    }

    private detectShouldFlee() {
        if (this.hasShield()) {
            return;
        }
        if (Players.getMe().health < this.config.fleeHealthThresholdMin) {
            this.state.isFleeing = true;
        }
    }

    private detectStuckness() {
        if (this.state.isStuck) {
            // no need to re-detect
            return;
        }

        const me = Players.getMe();
        const speed = me.speed;
        const seemsStuck = Math.abs(speed.x) < 1 && Math.abs(speed.y) < 1 && me.state.thrustLevel > 0;

        if (seemsStuck) {
            if (!this.state.stucknessTimeout) {
                this.state.stucknessTimeout = Date.now() + this.config.stucknessTimeoutMs;
            } else {
                this.state.stucknessTimeout = this.state.stucknessTimeout - this.config.heartbeatInterval;
            }

            const stucknessElapsed = this.state.stucknessTimeout <= 0;

            if (stucknessElapsed) {
                this.state.stucknessTimeout = null;
                this.state.isStuck = true;
                const durationRandomness = Spatie.getRandomNumber(0, 250);
                this.state.stuckTimeStopTurning = Date.now() + this.config.stucknessTurnDurationMs - durationRandomness;
                this.state.stuckTimeStopFlying = Date.now() + this.config.stucknessFlyDurationMs + durationRandomness;
                if (this.state.detectedPowerUps && this.state.detectedPowerUps.length > 0) {
                    // stuckness is probably caused by the powerups?
                    this.state.detectedPowerUps = null;
                }
            }
        } else {
            this.state.stucknessTimeout = this.state.stucknessTimeout + this.config.heartbeatInterval;
            if (this.state.stucknessTimeout > this.config.stucknessTimeoutMs) {
                this.state.stucknessTimeout = null;
            }
        }
    }

    private detectVictimPowerUps() {
        this.state.isVictimPoweredUp = false;

        if (!this.state.victim) {
            return;
        }
        if (this.state.victim.powerups.rampage || this.state.victim.powerups.shield) {
            this.state.isVictimPoweredUp = true;
        }
    }

    private fireAtVictim() {
        if (this.config.holdFire) {
            return;
        }
        if (this.config.fireConstantly) {
            this.setFire(true, null);
            return;
        }

        // fire at pursuitor while fleeing
        let shouldFire = this.state.isFleeing;

        // always fire when we have an upgrade
        if (!shouldFire) {
            const isRampaging = Players.getMe().powerups.rampage;
            shouldFire = isRampaging;
        }

        // otherwise fire if near the victim
        if (!shouldFire) {
            if (this.state.victim) {
                const delta = this.getDeltaTo(this.state.victim);
                shouldFire = delta.distance < this.config.distanceNear;
            }
        }

        let stopFiringTimeout = 1000;
        if (this.state.isFleeing) {
            stopFiringTimeout = 200;
        }

        this.setFire(shouldFire, stopFiringTimeout);
    }

    private fleeFrom(thing: any) {
        const me = Players.getMe();
        const delta = Spatie.calcDiff(me.pos, thing.pos);

        if (this.config.useSpecial === "WHOMP" && me.energy > 0.4 && delta.distance < this.config.distanceMissileDangerous) {
            // whomp the thing away
            this.setWhomp();
            Spatie.log("WHOMPING, energy level " + me.energy);

            // and don't dodge
            return;
        }

        let directionToThing = Math.atan2(delta.diffX, delta.diffY);
        const pi = Math.atan2(0, -1);
        if (directionToThing < 0) {
            directionToThing = pi * 2 + directionToThing;
        }
        let rotDiff = directionToThing - me.rot;

        let steerTo;
        if (Math.abs(rotDiff) > this.config.precision * 2) {
            if (rotDiff > 0 && rotDiff <= pi) {
                steerTo = "RIGHT";
            } else {
                steerTo = "LEFT";
            }
        }
        this.setTurnMovement(steerTo);
        this.setFastMovement(true);
        this.setSpeedMovement("DOWN");
    }

    private getDeltaTo(what: any) {
        what = what || this.state.victim;

        // accuracy
        let isAccurate = true;
        let victimPos = what.pos;
        if (what.lowResPos) {
            isAccurate = Spatie.calcDiff(what.lowResPos, what.pos).distance < this.config.distanceNear;
            victimPos = isAccurate ? victimPos : what.lowResPos;
        }

        const myPos = Players.getMe().pos;

        const delta = {
            ...Spatie.calcDiff(myPos, victimPos),
            isAccurate: isAccurate
        };

        return delta;
    }

    private getHostilePlayersSortedByDistance(excludeID: number = null) {
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
    }

    private handleFlee() {
        // find the nearest player and flee from it
        if (Players.getMe().health > this.config.fleeHealthThresholdMax || this.hasShield()) {
            this.state.isFleeing = false;
            return;
        }
        const playerToFleeFrom = this.getHostilePlayersSortedByDistance()[0];
        if (!playerToFleeFrom) {
            this.state.isFleeing = false;
            return;
        }

        const delta = this.getDeltaTo(playerToFleeFrom);
        if (delta.distance > this.config.distanceFar * 2) {
            this.state.isFleeing = false;
            return;
        }

        this.fleeFrom(playerToFleeFrom);
    }

    private handleObjectToFleeFrom() {
        // the idea is to face the object and fly backwards
        let obj = Mobs.get(this.state.objectToFleeFromID);
        if (!obj) {
            obj = Players.get(this.state.objectToFleeFromID);
        }

        if (!obj || this.hasShield()) {
            return;
        }
        this.fleeFrom(obj);
    }

    private handleStuckness() {
        var ms = Date.now();
        if (ms < this.state.stuckTimeStopTurning) {
            if (!this.state.turnMovement) {
                const direction = ["LEFT", "RIGHT"][Spatie.getRandomNumber(0, 2)];
                this.setTurnMovement(direction);
            }
            this.setSpeedMovement("DOWN");
        } else if (ms >= this.state.stuckTimeStopTurning && ms < this.state.stuckTimeStopFlying) {
            this.setTurnMovement(null);
            this.setSpeedMovement("UP");
        } else if (ms >= this.state.stuckTimeStopFlying) {
            this.setSpeedMovement(null);
            this.state.isStuck = false;
        }
    }

    private hasRampage() {
        return Players.getMe().powerups.rampage;
    }

    private hasShield() {
        return Players.getMe().powerups.shield;
    }

    private heartbeat() {
        this.state.previous = this.state.name;
        if (this.state.isStuck) {
            this.state.name = "stuck";
            this.handleStuckness();
        } else if (this.state.objectToFleeFromID) {
            this.state.name = "flee from object";
            this.detectStuckness();
            this.handleObjectToFleeFrom();
        } else if (this.state.isFleeing) {
            this.state.name = "low health flee";
            this.detectStuckness();
            this.handleFlee();
        } else if (this.state.detectedPowerUps && this.state.detectedPowerUps.length > 0) {
            this.state.name = "chase mob";
            this.approachMob();
            this.detectStuckness();
            this.detectShouldFlee();
        } else if (this.state.gotoCoords) {
            this.state.name = "go to coords";
            this.approachCoords();
            this.detectStuckness();
            this.detectShouldFlee();
        } else {
            this.state.name = "chase victim " + (this.state.victim ? this.state.victim.name : "-");
            this.detectFlagTaken();
            this.reconsiderVictim();
            this.turnToVictim();
            this.approachVictim();
            this.fireAtVictim();
            this.detectVictimPowerUps();
            this.detectStuckness();
            this.detectShouldFlee();
        }

        if (this.state.name !== this.state.previous) {
            Spatie.log(this.state.name);
        }

        this.applyUpgrades();
        this.commandExecutor.executeCommands();
        this.detectDangerousObjects();
    }

    private isOn() {
        return !!this.state;
    }

    private reconsiderVictim() {
        let hadVictim = !!this.state.victim;
        let victim;

        // always choose flag carrier as victim if there is one
        if (this.state.flagCarrierID) {
            hadVictim = false;
            victim = Players.get(this.state.flagCarrierID);
        } else {
            // choose a new victim if no victim selected
            victim = this.state.victim || this.chooseNextVictim();

            if (!victim) {
                return;
            }

            const elapsedMsSinceLastChosenVictim = Date.now() - this.state.lastTimeVictimWasChosen;

            const isActive = !!Players.get(victim.id);
            const isSpectating = victim.removedFromMap;
            const isProwler = victim.type === 5;
            const hasSuggestionForOtherVictim = !!this.state.suggestedVictimID;
            const isVictimImmune = !!/^test.*/.exec(victim.name) ||
                (this.config.bondingTimes > 0 && !!/^.+Bot.*/.exec(victim.name));

            let isExpired;
            if (this.state.lastTimeVictimWasChosen) {
                isExpired = elapsedMsSinceLastChosenVictim > this.config.victimExpireMs;
            }

            if (!isActive || isProwler || isSpectating || isExpired || isVictimImmune) {
                // choose another victim
                victim = null;
            }

            if (hasSuggestionForOtherVictim) {
                Spatie.log("Victim was suggested: " + this.state.suggestedVictimID);
                hadVictim = false;
                victim = Players.get(this.state.suggestedVictimID);
                this.state.suggestedVictimID = null;
            }

            if (victim) {
                // if there are other players closer by, consider chasing them
                const closestHostilePlayer = this.getHostilePlayersSortedByDistance()[0];
                if (closestHostilePlayer.id !== victim.id) {
                    const victimDistance = this.getDeltaTo(victim);
                    const closestPlayerDistance = this.getDeltaTo(closestHostilePlayer);

                    let shouldSwitch;
                    if (!closestPlayerDistance.isAccurate || victimDistance.distance < this.config.distanceClose) {
                        shouldSwitch = false;
                    } else if (closestPlayerDistance.isAccurate && !victimDistance.isAccurate) {
                        shouldSwitch = true;
                    } else if (closestPlayerDistance.distance / victimDistance.distance < 0.5) {
                        shouldSwitch = true;
                    }

                    if (shouldSwitch) {
                        victim = closestHostilePlayer;
                        hadVictim = false;
                    }
                }
            }
        }

        const hasVictim = !!victim;

        if (hasVictim !== hadVictim) {
            if (hadVictim && !hasVictim) {
                Spatie.log("Dropped victim " + this.state.victim.name);
            } else if (hasVictim && !hadVictim) {
                Spatie.log("Chose new victim " + victim.name);
            }

            this.state.lastTimeVictimWasChosen = Date.now();
        }

        // always refresh victim object
        this.state.victim = victim ? Players.get(victim.id) : null;
    }

    private setFire(isFiring: boolean, stopFiringTimeout: number = null) {
        this.state.isFiring = isFiring;
        this.state.stopFiringTimeout = stopFiringTimeout;
    }

    private setTurnMovement(turnMovement: string) {
        this.state.turnMovement = turnMovement;
    }

    private setSpeedMovement(speedMovement: string) {
        this.state.speedMovement = speedMovement;
    }

    private setFastMovement(fast: boolean) {
        this.state.fast = fast;
    }

    private setWhomp() {
        this.state.whomp = true;
    }

    private turnTo(what: any) {
        const delta = this.getDeltaTo(what);

        let targetDirection = Math.atan2(delta.diffX, delta.diffY);
        const pi = Math.atan2(0, -1);
        if (targetDirection < 0) {
            targetDirection = pi * 2 + targetDirection;
        }
        let rotDiff = targetDirection - Players.getMe().rot;

        let steerTo;
        if (Math.abs(rotDiff) > this.config.precision) {
            if (rotDiff > 0 && rotDiff <= pi) {
                steerTo = "RIGHT";
            } else {
                steerTo = "LEFT";
            }
        }
        this.setTurnMovement(steerTo);
    }

    private turnToVictim() {
        const victim = this.state.victim;
        if (!victim) {
            return;
        }

        this.turnTo(victim);
    }

}

export { SpatieBot };