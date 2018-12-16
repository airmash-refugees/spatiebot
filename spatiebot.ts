// declare airmash and starmash globals
declare var Mobs: any;
declare var Players: any;
declare var Network: any;
declare var game: any;

import { BotConfigFactory, BotConfig } from "./botConfigFactory";
import { Spatie } from "./spatie";
import { SpatiebotState } from "./spatiebotState";
import { SpatiebotCommandExecutor } from "./spatiebotCommandExecutor";
import { SpatiebotVictimSelection } from "./spatiebotVictimSelection";
import { PlayerStat } from "./playerStat";
import { BotNavigation } from "./botNavigation";

const botConfigFactory = new BotConfigFactory();
let lastConfiguration: BotConfig;
const upgradeInfo = {
    availableUpgrades: 0,
    upgradeStats: <any>{}
};
const playerStats: PlayerStat[] = [];
const botNavigation = new BotNavigation();

class SpatieBot {
    private config: BotConfig;
    private state: SpatiebotState;
    private commandExecutor: SpatiebotCommandExecutor;
    private victimSelection: SpatiebotVictimSelection;
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
            this.victimSelection = null;
            this.state = null;
        }
    }

    public goto(x: number, y: number) {
        this.state.gotoCoords = { x, y };
    }

    public initialize(config: BotConfig = null) {
        if (this.isOn()) {
            return;
        }

        config = config ||
            lastConfiguration ||
            botConfigFactory.getConfigByAircraftType(Players.getMe().type);

        lastConfiguration = config;
        this.config = config;

        this.state = new SpatiebotState();
        this.commandExecutor = new SpatiebotCommandExecutor(this.state, this.config);
        this.victimSelection = new SpatiebotVictimSelection(this.state, this.config, playerStats);

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

    public onHit(attackingPlayerID: number) {
        if (!this.isOn()) {
            return;
        }

        let playerStat = playerStats.filter(x => x.id === attackingPlayerID)[0];
        if (!playerStat) {
            playerStat = new PlayerStat(attackingPlayerID);
            playerStats.push(playerStat);
        }

        playerStat.addHit();
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

    public switchConfig(configName: string): any {
        if (this.config.name !== configName) {
            const newConfig = botConfigFactory.getConfigByName(configName);

            if (newConfig) {
                this.dispose();
                this.initialize(newConfig);
            }
        }
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

    public suggestVictim(playerID: number, suggestedVictim: string) {
        if (!this.isOn()) {
            return;
        }

        const suggestedPlayer = Players.getByName(suggestedVictim);

        if (suggestedPlayer && suggestedPlayer.id !== game.myID) {
            this.state.suggestedVictimID = suggestedPlayer.id;
            this.state.suggestingPlayerID = playerID;
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

        const delta = Spatie.getDeltaTo(poi);

        if (delta.distance > this.config.distanceClose) {
            this.setFastMovement(true);
            this.setSpeedMovement("UP");
        } else {
            this.setFastMovement(false);
            this.setSpeedMovement(null);
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
                powerup.delta = Spatie.getDeltaTo(powerup);
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

        const delta = Spatie.getDeltaTo(victim);

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

            let agressivePlayerIDs;
            if (!this.config.offensive) {
                // if the bot is not an offensive bot, only flee from proven agressive players
                agressivePlayerIDs = playerStats
                    .filter(x => x.isAgressive)
                    .map(x => x.id);
            }

            const closestEnemy = Spatie.getHostilePlayersSortedByDistance(victimID, agressivePlayerIDs)[0];
            if (closestEnemy) {
                const delta = Spatie.getDeltaTo(closestEnemy);
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

                // turn a random angle around 90 degrees
                const pi = Math.atan2(0, -1);
                const randomAngle = Spatie.getRandomNumber(pi * 0.3 * 100, pi * 0.4 * 100) / 100;
                let randomDirection = Spatie.getRandomNumber(0, 2);
                randomDirection = randomDirection === 0 ? -1 : 1;

                this.setDesiredAngle(Players.getMe().rot + (randomDirection * randomAngle));

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
        if (this.config.fireConstantly) {
            this.setFire(true, null);
            return;
        }

        // fire at pursuitor while fleeing
        let shouldFire = this.state.isFleeing;

        // always fire when we have an upgrade
        if (!shouldFire) {
            const isRampaging = this.hasRampage();
            shouldFire = isRampaging;
        }

        // otherwise fire if near the victim
        if (!shouldFire) {
            if (this.state.victim) {
                const delta = Spatie.getDeltaTo(this.state.victim);
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

        this.setDesiredAngle(directionToThing);
        this.setFastMovement(true);
        this.setSpeedMovement("DOWN");
    }

    private handleFlee() {
        // find the nearest player and flee from it
        if (Players.getMe().health > this.config.fleeHealthThresholdMax || this.hasShield()) {
            this.state.isFleeing = false;
            return;
        }
        const playerToFleeFrom = Spatie.getHostilePlayersSortedByDistance()[0];
        if (!playerToFleeFrom) {
            this.state.isFleeing = false;
            return;
        }

        const delta = Spatie.getDeltaTo(playerToFleeFrom);
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
        if (ms < this.state.stuckTimeStopFlying) {
            this.setSpeedMovement("DOWN");
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
            // this.detectStuckness();
            this.detectShouldFlee();
        } else if (this.state.gotoCoords) {
            this.state.name = "go to coords";
            this.approachCoords();
            this.detectStuckness();
            this.detectShouldFlee();
        } else if (this.state.victim) {
            this.state.name = "chase victim " + this.state.victim.name;
            this.findPathToVictim();
            this.followPathDirection();
            this.approachVictim();
            this.fireAtVictim();
            this.detectVictimPowerUps();
            this.detectStuckness();
            this.detectShouldFlee();
            this.detectFlagTaken();
            this.victimSelection.selectVictim();
        } else {
            this.state.name = "finding life purpose";
            this.detectFlagTaken();
            this.victimSelection.selectVictim();
        }

        if (this.state.name !== this.state.previous) {
            Spatie.log(this.state.name);
        }

        this.applyUpgrades();
        this.detectAwayFromHome();
        this.detectDangerousObjects();
        this.commandExecutor.executeCommands();
    }

    findPathToVictim(): any {
        if (this.state.pathToPoi.length > 1) {

            // there is already a path being followed. See if the first direction can be removed
            const delta = Spatie.calcDiff(Players.getMe().pos, this.state.pathToPoi[0]);
            if (delta.distance < this.config.distanceClose) {
                this.state.pathToPoi.shift();
            }
            return;
        }

        let lastCoord;
        if (this.state.pathToPoi.length === 1) {
            lastCoord = this.state.pathToPoi.pop();
        }

        let victimPos = Spatie.getPosition(this.state.victim);

        const path = botNavigation.findPath(Players.getMe().pos, victimPos);
        path.shift(); // my own position

        if (lastCoord) {
            path.unshift(lastCoord);
        }

        this.state.pathToPoi = path;
    }

    private detectAwayFromHome() {
        if (!this.config.protectHomeBase) {
            return;
        }

        const deltaFromHome = Spatie.calcDiff(Players.getMe().pos, this.config.homeBase);
        if (deltaFromHome.distance > this.config.homeBase.radius) {
            this.state.gotoCoords = this.config.homeBase;
        }
    }

    private isOn() {
        return !!this.state;
    }

    private onMissileFired(missileID: number) {
        if (!this.isOn()) {
            return;
        }

        // keep track of this missile to flee from it when necessary
        this.state.missileIDs = this.state.missileIDs || [];
        this.state.missileIDs.push(missileID);
    }

    private onPowerupDetected(powerupID: number) {
        if (!this.isOn()) {
            return;
        }
        if (!this.config.goForUpgrades) {
            return;
        }
        this.state.detectedPowerUps = this.state.detectedPowerUps || [];
        this.state.detectedPowerUps.push(powerupID);
    }

    private setFire(isFiring: boolean, stopFiringTimeout: number = null) {
        this.state.isFiring = isFiring;
        this.state.stopFiringTimeout = stopFiringTimeout;
    }

    private setDesiredAngle(angle: number) {
        // only accept a new angle if the previous one has been processed
        // for now it's probably ok to just drop the new value: if it's really
        // important, it will be set again.
        if (isNaN(this.state.desiredAngle)) {
            this.state.desiredAngle = angle;
        }
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
        const delta = Spatie.getDeltaTo(what);

        let targetDirection = Math.atan2(delta.diffX, delta.diffY);
        const pi = Math.atan2(0, -1);
        if (targetDirection < 0) {
            targetDirection = pi * 2 + targetDirection;
        }

        this.setDesiredAngle(targetDirection);
    }

    private followPathDirection() {
        if (this.state.pathToPoi.length === 0) {
            return;
        }

        const nextPoi = {
            pos: {
                x: this.state.pathToPoi[0].x,
                y: this.state.pathToPoi[0].y,
            }
        };
        this.turnTo(nextPoi);
    }

}

export { SpatieBot };