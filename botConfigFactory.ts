class BotConfig {
    applyUpgradesTo: number;
    bondingTimes: number;
    distanceFar: number;
    distanceNear: number;
    distanceClose: number;
    distanceTooClose: number;
    distanceMissileDangerous: number;
    fleeHealthThresholdMin: number;
    fleeHealthThresholdMax: number;
    fireConstantly: boolean;
    goForUpgrades: boolean;
    heartbeatInterval: number;
    holdFire: boolean;
    name: string;
    precision: number;
    throttleInterval: number;
    respawnTimeout: number;
    stucknessTurnDurationMs: number;
    stucknessFlyDurationMs: number;
    stucknessTimeoutMs: number;
    useSpecial: string;
    useStealth: boolean;
    victimExpireMs: number;
}

class BotConfigFactory {
    private readonly normalBotConfig: BotConfig = {
        applyUpgradesTo: 4,
        bondingTimes: 0,
        distanceFar: 600,
        distanceNear: 450,
        distanceClose: 300,
        distanceTooClose: 200,
        distanceMissileDangerous: 300,
        fleeHealthThresholdMin: 0.3,
        fleeHealthThresholdMax: 0.7,
        fireConstantly: false,
        goForUpgrades: true,
        heartbeatInterval: 75,
        holdFire: false,
        name: "normal",
        precision: 0.1,
        throttleInterval: 150,
        respawnTimeout: 4000,
        stucknessTurnDurationMs: 500,
        stucknessFlyDurationMs: 2000,
        stucknessTimeoutMs: 1500,
        useSpecial: "SPEED",
        useStealth: false,
        victimExpireMs: 120 * 1000,
    };

    private readonly peacefulBotConfig: BotConfig = {
        ...this.normalBotConfig, ...{
            applyUpgradesTo: 2,
            distanceFar: 1200,
            distanceNear: 850,
            distanceClose: 600,
            distanceTooClose: 400,
            fleeHealthThresholdMin: 0.5,
            fleeHealthThresholdMax: 0.9,
            goForUpgrades: true,
            holdFire: true,
            name: "peaceful",
            precision: 0.3
        }
    };

    private readonly agressiveBotConfig: BotConfig = {
        ...this.normalBotConfig, ...{
            applyUpgradesTo: 4,
            distanceTooClose: 50,
            distanceMissileDangerous: 50,
            fireConstantly: true,
            fleeHealthThresholdMin: 0.2,
            fleeHealthThresholdMax: 0.5,
            name: "agressive",
            precision: 0.15,
            stucknessTimeoutMs: 1000,
        }
    };

    private readonly copterBotConfig: BotConfig = {
        ...this.normalBotConfig, ...{
            applyUpgradesTo: 2,
            distanceTooClose: 400,
            distanceMissileDangerous: 400,
            fireConstantly: true,
            fleeHealthThresholdMin: 0.5,
            fleeHealthThresholdMax: 0.9,
            name: "copter",
            useSpecial: null,
        }
    };

    private readonly tornadoBotConfig: BotConfig = {
        ...this.normalBotConfig, ...{
            applyUpgradesTo: 1,
            distanceTooClose: 100,
            distanceMissileDangerous: 200,
            fleeHealthThresholdMin: 0.5,
            fleeHealthThresholdMax: 0.9,
            name: "tornado",
            useSpecial: "FIRE",
        }
    };

    private readonly prowlerBotConfig: BotConfig = {
        ...this.normalBotConfig, ...{
            distanceNear: 300,
            distanceClose: 200,
            distanceTooClose: 50,
            distanceMissileDangerous: 200,
            name: "prowler",
            useStealth: true,
            useSpecial: "STEALTH",
        }
    };

    private readonly goliathBotConfig: BotConfig = {
        ...this.normalBotConfig, ...{
            applyUpgradesTo: 1,
            distanceNear: 500,
            distanceClose: 300,
            distanceTooClose: 150,
            distanceMissileDangerous: 280,
            fleeHealthThresholdMin: 0.2,
            fleeHealthThresholdMax: 0.4,
            name: "goliath",
            useSpecial: "WHOMP",
        }
    };

    public getConfigByName(name: string): BotConfig {
        let botConfig = this.normalBotConfig;

        switch (name) {
            case "peaceful":
                botConfig = this.peacefulBotConfig;
                break;

            case "agressive":
                botConfig = this.agressiveBotConfig;
                break;

            case "copter":
                botConfig = this.copterBotConfig;
                break;

            case "tornado":
                botConfig = this.tornadoBotConfig;
                break;

            case "prowler":
                botConfig = this.prowlerBotConfig;
                break;

            case "goliath":
                botConfig = this.goliathBotConfig;
                break;
        }

        return botConfig;
    }

    public getConfigByAircraftType(type: number): BotConfig {

        switch (type) {
            case 1:
                return this.agressiveBotConfig;
            case 2:
                return this.goliathBotConfig;
            case 3:
                return this.copterBotConfig;
            case 4:
                return this.tornadoBotConfig;
            case 5:
                return this.prowlerBotConfig;
            default:
                return this.normalBotConfig;
        }
    }
}

export { BotConfig, BotConfigFactory };