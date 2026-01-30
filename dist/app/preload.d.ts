/**
 * preload.ts - Pont sécurisé entre le main process et le renderer
 */
declare const api: {
    checkConfig: () => Promise<{
        hasApiKey: boolean;
    }>;
    saveApiKey: (apiKey: string) => Promise<{
        success: boolean;
    }>;
    initialize: () => Promise<{
        success: boolean;
        error?: string;
    }>;
    startBot: () => Promise<{
        success: boolean;
        error?: string;
    }>;
    sendMessage: (message: string) => Promise<{
        success: boolean;
        error?: string;
    }>;
    saveMemory: () => Promise<{
        success: boolean;
    }>;
    answerQuestion: (answer: string) => void;
    onBotMessage: (callback: (message: string) => void) => void;
    onSystemMessage: (callback: (message: string) => void) => void;
    onAskUser: (callback: (question: string) => void) => void;
};
export type DangerousBotAPI = typeof api;
export {};
//# sourceMappingURL=preload.d.ts.map