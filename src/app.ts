declare const SWAM: any;
declare const Mobs: any;
declare const UI: any;
declare const Graphics: any;
declare const SettingsProvider: any;
declare const game: any;
declare const Games: any;
declare const Network: any;
declare const Players: any;

import { Spatie } from "./spatie";
import { SpatieBot } from "./spatiebot";
import { flagInfo } from "./flagInfo";

function spatiebotInitializer() {
    let currentBot: SpatieBot = null;
    let limitUpdates: boolean = false;
    let toggleKey: string = "b";
    let logChat: boolean = false;
    let useInsults: boolean = false;

    function createNewBot() {
        const newBot = new SpatieBot();

        // expose to manipulating in the console
        (<any>window).Spatie = Spatie;
        (<any>window).SpatieBot = newBot;

        return newBot;
    }

    function createSettingsProvider() {
        // this is the handler that will be executed when new settings are applied
        function onApply(values: any) {
            limitUpdates = values.limitUpdates;
            toggleKey = values.toggleKey;
            logChat = values.logChat;
            useInsults = values.useInsults;
        }

        // default values for the settings
        let defaultValues = {
            limitUpdates: false,
            toggleKey: "b",
            logChat: false,
            useInsults: false,
        };

        let sp = new SettingsProvider(defaultValues, onApply);
        let section = sp.addSection("SpatieBot settings");
        section.addBoolean("limitUpdates", "Don't update screen when window doesn't have focus (for hosting many bots)");
        section.addBoolean("logChat", "Log chat to console");
        section.addBoolean("useInsults", "Insult 1 of 4 killing this bot");
        section.addString("toggleKey", "Key to press to toggle the bot", { maxLength: 1 });

        return sp;
    }

    SWAM.registerExtension({
        name: "SpatieBot 4.2",
        id: "spatie042",
        description: "Runs one bot",
        author: "Spatie",
        version: "4.2",
        settingsProvider: createSettingsProvider(),
    });

    SWAM.on("gamePrep", function () {
        console.log("Press '" + toggleKey + "' to toggle bot");

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

        // hijack the networkFlag function to detect the flag location
        const orgNetworkFlag = Games.networkFlag;
        Games.networkFlag = function () {
            orgNetworkFlag.apply(null, arguments);

            const info = arguments[0];
            if (info.type === 1) {
                flagInfo.setFlagLocation(info.flag, info.posX, info.posY);
            } else if (info.type === 2) {
                flagInfo.setFlagTaken(info.flag);
            }
        };


        // suspend the raw game rendering if the window doesn't have focus
        const orgRender = Graphics.render;
        Graphics.render = function () {
            if (!limitUpdates || document.hasFocus()) {
                orgRender.apply(null, arguments);
            }
        };
    });

    SWAM.on("keyup", function (evt: any) {
        const key = evt.originalEvent.key;
        if (key === toggleKey.toLocaleUpperCase() || key === toggleKey.toLocaleLowerCase()) {
            if (currentBot) {
                currentBot.dispose();
                currentBot = null;
            } else {
                currentBot = createNewBot();
                currentBot.initialize();
            }
        }
    });

    SWAM.on("playerImpacted", function (data: any) {
        const owner = data.owner;
        const impactedPlayer = data.players[0].id;

        if (currentBot && impactedPlayer === game.myID) {
            currentBot.onHit(owner);
        }
    });

    SWAM.on("playerKilled", function (data: any, dead: any, killer: any) {
        if (currentBot) {
            currentBot.onPlayerKilled(dead.id, killer.id, useInsults);
        }
    });

    SWAM.on("chatLineAdded", function (player: any, text: any, type: any) {
        if (logChat) {
            console.log(player.name + ": " + text);
        }
        
        Spatie.onChatLine(text);

        if (currentBot) {
            if (text === "-sb-drop") {
                currentBot.dropFlag(player);
            } else if (text === "-sb-help") {
                Spatie.announceGeneral(["-sb-target: shows current target.", "-sb-suggest <player>: go after <player>.",
                    "In CTF: -sb-drop: drop the flag", "-sb-defend: go D", "-sb-attack: go O"]);
            } else if (text === "-sb-defend") {
                currentBot.defend(player, true);
            } else if (text === "-sb-attack") {
                currentBot.defend(player, false);
            } else if (text === "-sb-bond") {
                // bond with all other players with 'Bot 'in their names during 3 lives
                currentBot.toggleBonding();
            } else if (text === "-sb-target") {
                currentBot.announceTarget();
            } else {
                const suggestionRe = /-sb-suggest[: ]+(.*)/;
                const suggestionMatch = suggestionRe.exec(text);
                if (suggestionMatch) {
                    const suggestedVictim = suggestionMatch[1];
                    currentBot.suggestVictim(player.id, suggestedVictim);
                } else {
                    const configRe = /-sb-config[: ]+(.*)/;
                    const configMatch = configRe.exec(text);
                    if (configMatch && player.id === game.myID) {
                        currentBot.switchConfig(configMatch[1]);
                    }
                }
            }
        }
    });

    let botWasOn = false;
    function gameStarted() {
        if (!currentBot) {
            if (botWasOn) {
                currentBot = createNewBot();
                currentBot.initialize();

                if (game.gameType === 2) {
                    const randomNumber = Spatie.getRandomNumber(0, 4);
                    currentBot.defend(Players.getMe(), randomNumber === 0);
                }
            }
        }
    }
    function gameEnded() {
        botWasOn = !!currentBot;
        if (currentBot) {
            currentBot.dispose();
            currentBot = null;
        }
    }

    SWAM.on("CTF_MatchStarted", gameStarted);
    SWAM.on("CTF_MatchEnded", gameEnded);
    SWAM.on("BTR_MatchStarted", gameStarted);
    SWAM.on("BTR_MatchEnded", gameEnded);

    // reconnect if the bot gets disconnected
    setInterval(() => {
        const msg = document.getElementById("msg-alert");
        if (!msg) {
            return;
        }

        if (/DISCONNECTED/.exec(msg.innerText)) {
            if (currentBot) {
                currentBot.dispose();
                currentBot = null;

                Network.reconnect();

                setTimeout(() => {
                    currentBot = createNewBot();
                    currentBot.initialize();
                }, 3000);
            }
        }
    }, 5000);
}

spatiebotInitializer();