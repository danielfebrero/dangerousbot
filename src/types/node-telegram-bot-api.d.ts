declare module 'node-telegram-bot-api' {
  export default class TelegramBot {
    constructor(token: string, options?: { polling?: boolean });
    on(event: string, callback: (msg: any) => void): void;
    sendMessage(chatId: number | string, text: string, options?: any): Promise<any>;
    sendChatAction(chatId: number | string, action: string): Promise<any>;
    stopPolling(): Promise<any>;
    onText(regex: RegExp, callback: (msg: any, match: any) => void): void;
    getFileLink(fileId: string): Promise<string>;
  }
}
