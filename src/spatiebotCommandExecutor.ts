declare var Network: any;
declare var Players: any;
declare var AutoPilot: any;

import { SpatiebotState } from "./spatiebotState";
import { BotConfig } from "./botConfigFactory";
import { Spatie } from "./spatie";

class SpatiebotCommandExecutor {

    private networkSendKey = Network.sendKey;

    constructor(private state: SpatiebotState, private config: BotConfig) {
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

    private setThrottleTimeFor(what: string) : void {
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

        if (desiredAngleChanged || movementChanged || fastChanged || fireChanged || whompChanged || this.isAnyThrottleTimeElapsed()) {

            if (movementChanged) {
                if (this.state.previousSpeedMovement) {
                    Network.sendKey(this.state.previousSpeedMovement, false);
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
                this.turnToDesiredAngle();
                this.setThrottleTimeFor("angle");
            }

            if (this.state.speedMovement && (movementChanged || this.isThrottleTimeElapsedFor("movement"))) {
                Network.sendKey(this.state.speedMovement, true);
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

    private turnToDesiredAngle() {
        const myRot = Players.getMe().rot;
        const desRot = this.state.desiredAngle;
        const rotDiff = Math.abs(myRot - desRot);
        if (rotDiff > this.config.precision) {
            const pi = Math.atan2(0, -1);
            let direction;
            if (myRot > desRot) {
                if (rotDiff > pi) {
                    direction = "RIGHT";
                } else {
                    direction = "LEFT";
                }
            } else if (myRot < desRot) {
                if (rotDiff > pi) {
                    direction = "LEFT";
                } else {
                    direction = "RIGHT";
                }
            }
            if (this.state.angleInterval) {
                clearInterval(this.state.angleInterval);
            }
            Network.sendKey(direction === "LEFT" ? "RIGHT" : "LEFT", false);
            Network.sendKey(direction, true);
            const myInterval = setInterval(() => {
                // stop when desired angle has been reached
                const desRot2 = this.state.desiredAngle;
                const myRot2 = Players.getMe().rot;
                const rotDiff = Math.abs(myRot2 - desRot2);
                if (rotDiff <= this.config.precision) {
                    clearInterval(myInterval);
                    Network.sendKey(direction, false);
                    this.state.desiredAngle = undefined; // as opposed to null, because NaN(null) === false
                }
            }, 50);
            this.state.angleInterval = myInterval;
        }
    }
}

export { SpatiebotCommandExecutor };