declare const Network: any;
declare const Players: any;
declare const game: any;

import { SpatiebotState } from "./spatiebotState";
import { BotConfig } from "./botConfigFactory";
import { Spatie } from "./spatie";

// rotation speeds per 100 ms
const rotationSpeeds = {
    1: 0.39, // predator
    2: 0.24, // goliath
    3: 0.42, // mohawk
    4: 0.33, // tornado
    5: 0.33  // prowler
};
const pi = Math.atan2(0, -1);

class SpatiebotCommandExecutor {

    private mySpeed: number;

    constructor(private state: SpatiebotState, private config: BotConfig) {
        const aircraftType = Players.getMe().type;
        this.mySpeed = rotationSpeeds[aircraftType] || 0.33;
    }

    public clearCommands() {
        Network.sendKey("LEFT", false);
        Network.sendKey("RIGHT", false);
        Network.sendKey("UP", false);
        Network.sendKey("DOWN", false);
        Network.sendKey("FIRE", false);
        Network.sendKey("SPECIAL", false);
    }

    private isThrottleTimeElapsedFor(what: string): boolean {
        return !this.state.nextMovementExec[what] || Date.now() > this.state.nextMovementExec[what];
    }

    private setThrottleTimeFor(what: string): void {
        this.state.nextMovementExec[what] = Date.now() + this.config.throttleInterval;
    }

    private isAnyThrottleTimeElapsed(): boolean {
        if (!this.state.nextMovementExec) {
            return true;
        }
        for (const p of this.state.nextMovementExec) {
            if (this.isThrottleTimeElapsedFor(p)) {
                return true;
            }
        }
        return false;
    }

    public executeCommands(isPlayerCarryingFlag: boolean) {

        if (!this.state.nextMovementExec) {
            this.state.nextMovementExec = {};
        }

        const desiredAngleChanged = this.state.lastDesiredAngle !== this.state.desiredAngle;
        const movementChanged = this.state.previousSpeedMovement !== this.state.speedMovement;
        const fireChanged = this.state.previousIsFiring !== this.state.isFiring;

        let whompChanged;
        if (this.config.useSpecial === "WHOMP") {
            whompChanged = this.state.previousWhomp !== this.state.whomp;
        }

        let fastChanged;
        if (this.config.useSpecial === "SPEED") {
            fastChanged = this.state.previousFast !== this.state.fast;
        }

        let desiredAngle = this.state.desiredAngle;
        let desiredMovement = this.state.speedMovement;
        let previousMovement = this.state.previousSpeedMovement;
        if (this.state.flybackwards) {
            if (desiredAngle) {
                if (desiredAngle > pi) {
                    desiredAngle -= pi;
                } else {
                    desiredAngle += pi;
                }
            }
            if (desiredMovement) {
                if (desiredMovement === "UP") {
                    desiredMovement = "DOWN";
                } else {
                    desiredMovement = "UP";
                }
            }
            if (previousMovement) {
                if (previousMovement === "UP") {
                    previousMovement = "DOWN";
                } else {
                    previousMovement = "UP";
                }
            }
        }

        if (desiredAngleChanged || movementChanged || fastChanged || fireChanged || whompChanged || this.isAnyThrottleTimeElapsed()) {

            if (movementChanged) {
                if (previousMovement) {
                    Network.sendKey(previousMovement, false);
                }
                this.state.previousSpeedMovement = this.state.speedMovement;
            }
            if (desiredAngleChanged) {
                this.state.lastDesiredAngle = this.state.desiredAngle;
            }
            if (fastChanged) {
                this.state.previousFast = this.state.fast;
            }
            if (fireChanged) {
                this.state.previousIsFiring = this.state.isFiring;
            }
            if (!isNaN(this.state.desiredAngle) && (desiredAngleChanged || this.isThrottleTimeElapsedFor("angle"))) {
                this.turnToDesiredAngle(desiredAngle);
                this.setThrottleTimeFor("angle");
            }

            if (this.state.speedMovement && (movementChanged || this.isThrottleTimeElapsedFor("movement"))) {
                Network.sendKey(desiredMovement, true);
                this.setThrottleTimeFor("movement");
            }

            if (this.config.useSpecial === "SPEED" && !isPlayerCarryingFlag) {
                if (fastChanged || this.isThrottleTimeElapsedFor("fast")) {
                    if (this.state.fast) {
                        if (!this.state.fastTimeout) {
                            Network.sendKey("SPECIAL", true);
                            this.state.fastTimeout = setTimeout(() => {
                                Network.sendKey("SPECIAL", false);
                                this.state.fastTimeout = null;
                            }, 1000);
                        }
                    } else {
                        Network.sendKey("SPECIAL", false);
                    }
                    this.setThrottleTimeFor("fast");
                }
            }

            if (fireChanged || this.isThrottleTimeElapsedFor("fire")) {
                let fireKey = "FIRE";
                if (this.config.useSpecial === "FIRE") {
                    fireKey = "SPECIAL";
                }

                if (this.state.isFiring) {
                    Network.sendKey(fireKey, true);

                    // don't turn the firebutton off if fireConstantly is on
                    if (!this.config.fireConstantly) {
                        if (!this.state.fireTimeout) {
                            const stopFiringTimeout = this.state.stopFiringTimeout || 1200;
                            this.state.fireTimeout = setTimeout(() => {
                                this.state.fireTimeout = null;
                                Network.sendKey(fireKey, false);
                                this.state.isFiring = false;
                            }, stopFiringTimeout);
                        }
                    }
                } else {
                    Network.sendKey(fireKey, false);
                }
                this.setThrottleTimeFor("fire");
            }

            // don't repeat following special commands on throttle elapsed, because they work one time only
            let doSpecial = false;

            if (this.config.useStealth && this.config.useSpecial === "STEALTH" && !Players.getMe().stealthed) {
                doSpecial = true;
            }

            if (whompChanged) {
                doSpecial = true;
                this.state.whomp = false;
                this.state.previousWhomp = false;
            }

            if (doSpecial) {
                Spatie.log("Sending special");
                Network.sendKey("SPECIAL", true);
                setTimeout(() => Network.sendKey("SPECIAL", false), 100);
            }
        }
    }

    private getRotDelta(myRot: number, desRot: number): { direction: string, rotDiff: number } {
        let rotDiff = Math.abs(myRot - desRot);
        let direction;
        if (myRot > desRot) {
            if (rotDiff > pi) {
                direction = "RIGHT";
                rotDiff = rotDiff - pi;
            } else {
                direction = "LEFT";
            }
        } else if (myRot < desRot) {
            if (rotDiff > pi) {
                direction = "LEFT";
                rotDiff = rotDiff - pi;
            } else {
                direction = "RIGHT";
            }
        }

        return { direction, rotDiff };
    }

    private turnToDesiredAngle(desRot: number) {
        if (this.state.angleTimeout) {
            // still turning
            return;
        }

        const rotDelta = this.getRotDelta(Players.getMe().rot, desRot);

        if (rotDelta.rotDiff > this.config.precision) {
            const msNeededToTurn = (rotDelta.rotDiff / this.mySpeed) * 100;

            Network.sendKey(rotDelta.direction === "LEFT" ? "RIGHT" : "LEFT", false);
            Network.sendKey(rotDelta.direction, true);
            const myTimeout = setTimeout(() => {
                Network.sendKey(rotDelta.direction, false);
                this.state.desiredAngle = undefined; // as opposed to null, because NaN(null) === false

                // wait ping before next update, to know our real angle
                this.state.angleTimeout = setTimeout(() => this.state.angleTimeout = null, game.ping);
            }, msNeededToTurn);
            this.state.angleTimeout = myTimeout;
        }
    }
}

export { SpatiebotCommandExecutor };