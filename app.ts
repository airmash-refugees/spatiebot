declare var SWAM: any;
declare var Mobs: any;
declare var UI: any;
declare var Graphics: any;

import { Spatie } from "./spatie";
import { SpatieBot } from "./spatiebot";


let currentBot: SpatieBot = null;

function createNewBot() {
    currentBot = new SpatieBot();

    // expose to manipulating in the console
    (<any>Window).Spatie = Spatie;
    (<any>Window).SpatieBot = currentBot;
}

SWAM.registerExtension({
    name: "SpatieBot 2.0",
    id: "spatie02",
    description: "Runs one bot",
    author: "Spatie",
    version: "2.0"
});

SWAM.on("gamePrep", function () {
    console.log("Press 'B' to toggle bot");

    // hijack the Mobs.add function to detect missiles being fired
    const orgMobsAdd = Mobs.add;
    Mobs.add = function (mob: any, unknown: any, playerID: number) {
        // call original function first
        orgMobsAdd.apply(null, arguments);

        if (currentBot) {
            currentBot.onMobAdd(playerID, mob);
        }
    };

    // hijack the updateUpgrades function to detect how many upgrades player has
    // unfortunately this method is only called when applying updates, so
    // we also need to hijack showmessage for this too
    const orgUiUpdateUpgrades = UI.updateUpgrades;
    UI.updateUpgrades = function (upgradeStats: any, availableUpgrades: any, type: any) {
        orgUiUpdateUpgrades.apply(null, arguments);

        if (currentBot) {
            currentBot.upgradeInfo.availableUpgrades = availableUpgrades;
            currentBot.upgradeInfo.upgradeStats = upgradeStats;
        }
    };

    // hijack the showmessage function to detect upgrades
    const orgShowMessage = UI.showMessage;
    UI.showMessage = function (type: any, message: any, duration: any) {
        // call original function first
        orgShowMessage.apply(null, arguments);

        const m = /upgrade/.exec(message);
        if (m) {
            if (currentBot) {
                currentBot.upgradeInfo.availableUpgrades = currentBot.upgradeInfo.availableUpgrades || 0;
                currentBot.upgradeInfo.availableUpgrades += 1;
            }
        }
    };

    // suspend the raw game rendering if the window doesn't have focus
    const orgRender = Graphics.render;
    Graphics.render = function () {
        if (document.hasFocus()) {
            orgRender.apply(null, arguments);
        }
    };
});

SWAM.on("keyup", function (evt: any) {
    const key = evt.originalEvent.key;
    if (key === "B" || key === "b") {
        if (currentBot) {
            currentBot.dispose();
            currentBot = null;
        } else {
            currentBot = new SpatieBot();
            currentBot.initialize();
        }
    }
});

SWAM.on("playerKilled", function (data: any, dead: any, killer: any) {
    if (currentBot) {
        currentBot.onPlayerKilled(dead.id, killer.id);
    }
});

SWAM.on("chatLineAdded", function (player: any, text: any, type: any) {
    console.log(player.name + ": " + text);
    if (currentBot) {
        if (text === "-sb-bond") {
            // bond with all other players with 'Bot 'in their names during 3 lives
            currentBot.toggleBonding();
        } else if (text === "-sb-target") {
            currentBot.announceTarget();
        } else {
            const re = /-sb-suggest[: ]+(.*)/;
            const suggestionMatch = re.exec(text);
            if (suggestionMatch) {
                const suggestedVictim = suggestionMatch[1];
                currentBot.suggestVictim(player.id, suggestedVictim);
            }
        }
    }
});