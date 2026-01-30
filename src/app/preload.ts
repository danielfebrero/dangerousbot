/**
 * preload.ts - Pont sécurisé entre le main process et le renderer
 */

import { contextBridge, ipcRenderer } from 'electron';

// API exposée au renderer
const api = {
  // Configuration
  checkConfig: (): Promise<{ hasApiKey: boolean }> => {
    return ipcRenderer.invoke('check-config');
  },

  saveApiKey: (apiKey: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('save-api-key', apiKey);
  },

  // Initialisation
  initialize: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('initialize');
  },

  // Bot
  startBot: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('start-bot');
  },

  sendMessage: (message: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('send-message', message);
  },

  saveMemory: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('save-memory');
  },

  // Répondre à une question du bot
  answerQuestion: (answer: string): void => {
    ipcRenderer.send('user-answer', answer);
  },

  // Événements du bot vers le renderer
  onBotMessage: (callback: (message: string) => void): void => {
    ipcRenderer.on('bot-message', (_event, message) => callback(message));
  },

  onSystemMessage: (callback: (message: string) => void): void => {
    ipcRenderer.on('system-message', (_event, message) => callback(message));
  },

  onAskUser: (callback: (question: string) => void): void => {
    ipcRenderer.on('ask-user', (_event, question) => callback(question));
  }
};

// Exposer l'API au renderer
contextBridge.exposeInMainWorld('dangerousBot', api);

// Type declaration pour le renderer
export type DangerousBotAPI = typeof api;
