declare var Network: any;
declare var Players: any;
declare var AutoPilot: any;

import { SpatiebotState } from "./spatiebotState";
import { BotConfig } from "./botConfigFactory";
import { Spatie } from "./spatie";

class SpatiebotCommandExecutor {

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

    public executeCommands() {

        const desiredAngleChanged = this.state.lastDesiredAngle !== this.state.desiredAngle;
        const movementChanged = this.state.previousSpeedMovement !== this.state.speedMovement;
        const throttleTimeElapsed = !this.state.nextMovementExec || Date.now() > this.state.nextMovementExec;
        const fireChanged = this.state.previousIsFiring !== this.state.isFiring;

        let whompChanged;
        if (this.config.useSpecial === "WHOMP") {
            whompChanged = this.state.previousWhomp !== this.state.whomp;
        }

        let fastChanged;
        if (this.config.useSpecial === "SPEED") {
            fastChanged = this.state.previousFast !== this.state.fast;
        }

        if (throttleTimeElapsed || desiredAngleChanged || movementChanged || fastChanged || fireChanged || whompChanged) {

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
            if (!isNaN(this.state.desiredAngle) && (desiredAngleChanged || throttleTimeElapsed)) {
                AutoPilot.rotateTo(this.state.desiredAngle, Players.getMe(), 0,
                    () => this.state.desiredAngle = undefined); // as opposed to null, because NaN(null) === false
            }

            if (this.state.speedMovement && (movementChanged || throttleTimeElapsed)) {
                Network.sendKey(this.state.speedMovement, true);
            }

            if (this.config.useSpecial === "SPEED") {
                if (fastChanged || throttleTimeElapsed) {
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
                }
            }

            if (fireChanged || throttleTimeElapsed) {
                console.log("Firing? " + this.state.isFiring);
                let fireKey = "FIRE";
                if (this.config.useSpecial === "FIRE") {
                    fireKey = "SPECIAL";
                }

                if (this.state.isFiring) {
                    if (!this.state.fireTimeout) {
                        const stopFiringTimeout = this.state.stopFiringTimeout || 1000;
                        Network.sendKey(fireKey, true);

                        // don't turn the firebutton off if fireConstantly is on
                        if (!this.config.fireConstantly) {
                            this.state.fireTimeout = setTimeout(() => {
                                this.state.fireTimeout = null;
                                Network.sendKey(fireKey, false);
                            }, stopFiringTimeout);
                        }
                    }
                } else {
                    Network.sendKey(fireKey, false);
                }
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

            this.state.nextMovementExec = Date.now() + this.config.throttleInterval;
        }
    }
}

export { SpatiebotCommandExecutor };