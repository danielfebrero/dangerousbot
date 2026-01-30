"use strict";
/**
 * preload.ts - Pont sécurisé entre le main process et le renderer
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// API exposée au renderer
const api = {
    // Configuration
    checkConfig: () => {
        return electron_1.ipcRenderer.invoke('check-config');
    },
    saveApiKey: (apiKey) => {
        return electron_1.ipcRenderer.invoke('save-api-key', apiKey);
    },
    // Initialisation
    initialize: () => {
        return electron_1.ipcRenderer.invoke('initialize');
    },
    // Bot
    startBot: () => {
        return electron_1.ipcRenderer.invoke('start-bot');
    },
    sendMessage: (message) => {
        return electron_1.ipcRenderer.invoke('send-message', message);
    },
    saveMemory: () => {
        return electron_1.ipcRenderer.invoke('save-memory');
    },
    // Répondre à une question du bot
    answerQuestion: (answer) => {
        electron_1.ipcRenderer.send('user-answer', answer);
    },
    // Événements du bot vers le renderer
    onBotMessage: (callback) => {
        electron_1.ipcRenderer.on('bot-message', (_event, message) => callback(message));
    },
    onSystemMessage: (callback) => {
        electron_1.ipcRenderer.on('system-message', (_event, message) => callback(message));
    },
    onAskUser: (callback) => {
        electron_1.ipcRenderer.on('ask-user', (_event, question) => callback(question));
    }
};
// Exposer l'API au renderer
electron_1.contextBridge.exposeInMainWorld('dangerousBot', api);
//# sourceMappingURL=preload.js.map