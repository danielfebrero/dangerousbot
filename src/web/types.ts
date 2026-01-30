export interface Message {
  id: string;
  type: 'user' | 'bot' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  toolName?: string;
}

export interface WSMessage {
  type: 'user_message' | 'bot_message' | 'bot_typing' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'connected';
  payload: any;
  timestamp?: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
