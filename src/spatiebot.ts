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
import { BotNavigationHub } from "./botNavigationHub";
import { getInsult } from "./insults";
import { flagInfo } from "./flagInfo";

const botConfigFactory = new BotConfigFactory();
let lastConfiguration: BotConfig;
const upgradeInfo = {
    availableUpgrades: 0,
    upgradeStats: <any>{}
};
const playerStats: PlayerStat[] = [];

class SpatieBot {
    private config: BotConfig;
    private state: SpatiebotState;
    private commandExecutor: SpatiebotCommandExecutor;
    private botNavigationHub = new BotNavigationHub();
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
            this.botNavigationHub.destroy();

            this.commandExecutor = null;
            this.botNavigationHub = null;

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

        if (lastConfiguration && lastConfiguration.aircraftType !== Players.getMe().type) {
            // not compatible with current aircraft
            lastConfiguration = null;
        }

        config = config ||
            lastConfiguration ||
            botConfigFactory.getConfigByAircraftType(Players.getMe().type);

        lastConfiguration = config;
        this.config = config;

        this.state = new SpatiebotState();
        this.commandExecutor = new SpatiebotCommandExecutor(this.state, this.config);
        this.victimSelection = new SpatiebotVictimSelection(this.state, this.config, playerStats);
        this.botNavigationHub = new BotNavigationHub();

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

        try {
            Spatie.log(JSON.stringify(this.state));
        } catch (error) {
            console.log(this.state);
        }

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

    public onPlayerKilled(killedID: number, killerID: number, useInsults: boolean) {
        if (!this.isOn()) {
            return;
        }

        if (killedID === game.myID) {
            Spatie.log("I was killed. Restarting.");
            this.dispose();
            setTimeout(() => this.initialize(), this.config.respawnTimeout);

            if (useInsults) {
                const randNumber = Spatie.getRandomNumber(0, 3);
                if (randNumber === 0) {
                    const playerName = Players.get(killerID).name;
                    const insult = getInsult();
                    Spatie.announce(playerName + ", you " + insult.toLocaleLowerCase());
                }
            }
        } else if (this.state.victim && killedID === this.state.victim.id) {
            Spatie.log("Victim was killed, choosing another victim.");
            this.state.victim = null;
            this.state.pathToVictim = null;
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

        const delta = Spatie.getDeltaTo(poi);

        this.setSpeedMovement("UP");
        this.setFastMovement(false);

        if (delta.distance > this.config.distanceNear) {
            this.setFastMovement(true);
        } else if (delta.distance < this.config.distanceZero) {
            this.setSpeedMovement(null);
            this.state.gotoCoords = null;
        }
    }

    private approachMob() {
        this.setSpeedMovement("UP");
        if (this.state.mob.delta.distance > this.config.distanceClose) {
            this.setFastMovement(true);
        }
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
        const blueFlagCarrierName = getPlayerName($("#blueflag-name").html(), /^([^<>]+)</);
        const redFlagCarrierName = getPlayerName($("#redflag-name").html(), />([^<>]+)$/);

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

        flagInfo.setFlagCarrier(1, blueFlagCarrierName);
        flagInfo.setFlagCarrier(2, redFlagCarrierName);

        function getPlayerName(raw: string, re: RegExp) {
            const m = re.exec(raw);
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

        if (this.state.objectToFleeFromID) {
            this.clearPathFinding();
        }
    }

    private detectShouldFlee() {
        if (this.hasShield()) {
            return;
        }
        if (Players.getMe().health < this.config.fleeHealthThresholdMin) {
            this.state.isFleeing = true;
            this.clearPathFinding();
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

                this.clearPathFinding();

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

        // fire at pursuitor(s) while fleeing / carrying flag
        let shouldFire = this.state.isFleeing || this.isPlayerCarryingFlag();

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
        }

        let directionToThing = Math.atan2(delta.diffX, -delta.diffY);
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

    private clearPathFinding() {
        this.state.pathToMob = null;
        this.state.pathToVictim = null;
        this.state.pathToCoords = null;
        this.state.startedFindingPathToMob = null;
        this.state.startedFindingPathToVictim = null;
        this.state.startedFindingPathToCoords = null;
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
        } else if (this.state.gotoCoords && (!this.state.pathToCoords || this.state.pathToCoords.length === 0)) {
            this.state.name = "finding path to coords";
            this.findPathToCoords();
            this.temporaryMoveToCoords();
            this.detectStuckness();
            this.detectShouldFlee();
        } else if (this.state.gotoCoords) {
            this.state.name = "go to coords";
            this.findPathToCoords();
            this.followPathDirectionToCoords();
            this.approachCoords();
            this.updatePath(this.state.pathToCoords);
            this.detectShouldFlee();
        } else if (this.state.mob && (!this.state.pathToMob || this.state.pathToMob.length === 0)) {
            this.state.name = "finding path to mob";
            this.findPathToMob();
            this.temporaryMoveToMob();
            this.detectStuckness();
            this.detectShouldFlee();
        } else if (this.state.mob) {
            this.state.name = "chase mob";
            this.findPathToMob();
            this.followPathDirectionToMob();
            this.approachMob();
            this.updatePath(this.state.pathToMob);
            this.detectShouldFlee();
        } else if (this.state.victim && (!this.state.pathToVictim || this.state.pathToVictim.length === 0)) {
            this.state.name = "finding path to victim";
            this.findPathToVictim();
            this.temporaryMoveToVictim();
            this.detectStuckness();
            this.detectShouldFlee();
        } else if (this.state.victim) {
            this.state.name = "chase victim " + this.state.victim.name;
            this.findPathToVictim();
            this.followPathDirectionToVictim();
            this.approachVictim();
            this.updatePath(this.state.pathToVictim);
            this.detectVictimPowerUps();
            // this.detectStuckness();
            this.detectShouldFlee();
            this.victimSelection.selectVictim();
        } else {
            this.state.name = "finding life purpose";
            this.victimSelection.selectVictim();
        }

        if (this.state.name !== this.state.previous) {
            Spatie.log(this.state.name);
        }

        this.fireAtVictim();
        this.applyUpgrades();
        this.detectAwayFromHome();
        this.detectDangerousObjects();
        this.commandExecutor.executeCommands(this.isPlayerCarryingFlag());
        this.detectFlagTaken();
        this.detectFlagToGrab();

        if (!this.state.gotoCoords) {
            this.detectMobs();
        }
    }

    private updatePath(path: any[]): any {
        if (!path) {
            return;
        }

        const firstPos = path[0];

        var delta = Spatie.getDeltaTo(firstPos);

        if (delta.distance <= this.config.distanceZero) {
            path.shift();
        }
    }

    private isPlayerCarryingFlag(): boolean {
        if (game.gameType !== 2) {
            return false;
        }

        const otherTeam = Players.getMe().team === 1 ? 2 : 1;
        return flagInfo.getFlagInfo(otherTeam).carrierName === Players.getMe().name;
    }

    private detectFlagToGrab(): void {
        if (game.gameType !== 2) {
            return;
        }

        const otherTeam = Players.getMe().team === 1 ? 2 : 1;

        const enemyFlag = flagInfo.getFlagInfo(otherTeam);
        if (enemyFlag.taken) {
            if (this.isPlayerCarryingFlag()) {
                // i'm the flag carrier!
                const myHomeBase = flagInfo.getHomebase(Players.getMe().team);
                if (this.state.gotoCoords !== myHomeBase.pos) {
                    this.state.gotoCoords = myHomeBase.pos;
                    this.clearPathFinding();
                }
            } else {
                this.state.gotoCoords = null;
                this.clearPathFinding();
            }
        } else {
            if (this.state.gotoCoords !== enemyFlag.pos) {
                this.state.gotoCoords = enemyFlag.pos;
                this.clearPathFinding();
            }
        }
    }

    // while finding path, do a simple move to victim
    private temporaryMoveToVictim(): any {
        if (this.state.victim) {
            this.turnTo(this.state.victim);
            this.approachVictim();
        }
    }

    // while finding path, do a simple move to victim
    private temporaryMoveToMob(): any {
        if (this.state.mob) {
            this.turnTo(this.state.mob);
            this.approachMob();
        }
    }

    // while finding path, do a simple move to victim
    private temporaryMoveToCoords(): any {
        if (this.state.gotoCoords) {
            const coords = this.state.gotoCoords;
            const poi = { pos: coords };

            this.turnTo(poi);
            this.approachCoords();
        }
    }

    detectMobs(): any {
        if (!this.state.detectedPowerUps || this.state.detectedPowerUps.length === 0) {
            return;
        }

        // find closest, and cleanup the detectedPowerups array in the process
        const powerups = [];
        let closestPowerup;
        for (var i = 0; i < this.state.detectedPowerUps.length; i++) {
            var powerup = Mobs.get(this.state.detectedPowerUps[i]);
            if (powerup) {
                powerups.push(powerup.id);
                powerup.delta = Spatie.getDeltaTo(powerup);
                if (powerup.delta.distance <= this.config.distanceFar * 2) {
                    if (!closestPowerup || closestPowerup.delta.distance > powerup.delta.distance) {
                        closestPowerup = powerup;
                    }
                }
            }
        }

        if (closestPowerup !== this.state.mob) {
            this.clearPathFinding();
        }

        this.state.mob = closestPowerup;
        this.state.detectedPowerUps = powerups;
    }

    private findPathTo(label: string, what: any, startedDt: number, callback: (path: any) => void, error: (err: any) => void): number {
        if (!this.botNavigationHub.isReady) {
            return null;
        }

        const reinitializeBotNavigation = () => {
            this.botNavigationHub.destroy();
            this.botNavigationHub = new BotNavigationHub();
        };

        const pathFinderTimeout = 5000;

        if (startedDt) {
            if (Date.now() - startedDt < pathFinderTimeout) {
                return startedDt;
            }
            // timeout elapsed
            // but the worker may still be doing its calculation if it's heavy
            if (this.botNavigationHub.lastAliveSignal && Date.now() - this.botNavigationHub.lastAliveSignal < pathFinderTimeout) {
                // wait some more
                return startedDt;
            }

            // timeout ultimately elapsed
            reinitializeBotNavigation();
            return null; // not ready yet, so try again next time
        }

        let whatPos = Spatie.getPosition(what);
        let whatDelta = Spatie.getDeltaTo(what);

        this.botNavigationHub.findPath(Players.getMe().pos, whatPos, (path) => {
            if (!this.isOn()) {
                return;
            }

            path.shift(); // my own position;
            callback(path);

            if (whatDelta.distance > this.config.distanceNear) {
                // wait for a few milliseconds before trying again
                this.botNavigationHub.isReady = false;
                setTimeout(() => {
                    if (this.isOn()) {
                        this.botNavigationHub.isReady = true;
                    }
                }, 800);
            }

        }, (err) => {
            if (!this.isOn()) {
                return;
            }

            Spatie.log(err);
            reinitializeBotNavigation();
            error(err);
        });

        return Date.now();

    }

    private findPathToVictim(): void {

        this.state.pathToMob = null;
        this.state.startedFindingPathToMob = null;
        this.state.pathToCoords = null;
        this.state.startedFindingPathToCoords = null;

        this.state.startedFindingPathToVictim = this.findPathTo("victim", this.state.victim, this.state.startedFindingPathToVictim,
            (path) => {
                this.state.startedFindingPathToVictim = null;
                this.state.pathToVictim = path;
            }, (error) => {
                this.state.startedFindingPathToVictim = null;
                this.state.pathToVictim = null;
            });
    }

    private findPathToMob() {
        this.state.pathToVictim = null;
        this.state.startedFindingPathToVictim = null;
        this.state.pathToCoords = null;
        this.state.startedFindingPathToCoords = null;

        this.state.startedFindingPathToMob = this.findPathTo("mob", this.state.mob, this.state.startedFindingPathToMob,
            (path) => {
                this.state.startedFindingPathToMob = null;
                this.state.pathToMob = path;
            }, (error) => {
                this.state.startedFindingPathToMob = null;
                this.state.pathToMob = null;
            });
    }

    private findPathToCoords() {
        this.state.pathToVictim = null;
        this.state.startedFindingPathToVictim = null;
        this.state.pathToMob = null;
        this.state.startedFindingPathToMob = null;

        const coords = this.state.gotoCoords;
        const poi = { pos: coords };

        this.state.startedFindingPathToCoords = this.findPathTo("poi", poi, this.state.startedFindingPathToCoords, (path) => {
            this.state.startedFindingPathToCoords = null;
            this.state.pathToCoords = path;
        }, (error) => {
            this.state.startedFindingPathToCoords = null;
            this.state.pathToCoords = null;
        });
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
        this.state.desiredAngle = angle;
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

        let targetDirection = Math.atan2(delta.diffX, -delta.diffY);
        const pi = Math.atan2(0, -1);
        if (targetDirection < 0) {
            targetDirection = pi * 2 + targetDirection;
        }

        this.setDesiredAngle(targetDirection);
    }

    private followPathDirectionToVictim() {
        if (!this.state.pathToVictim || this.state.pathToVictim.length === 0) {
            return;
        }

        const nextPoi = {
            pos: this.state.pathToVictim[0]
        };

        this.turnTo(nextPoi);
    }

    private followPathDirectionToMob() {
        if (!this.state.pathToMob || this.state.pathToMob.length === 0) {
            return;
        }

        const nextPoi = {
            pos: this.state.pathToMob[0]
        };

        this.turnTo(nextPoi);
    }

    private followPathDirectionToCoords() {
        if (!this.state.pathToCoords || this.state.pathToCoords.length === 0) {
            return;
        }

        const nextPoi = {
            pos: this.state.pathToCoords[0]
        };

        this.turnTo(nextPoi);
    }
}

export { SpatieBot };