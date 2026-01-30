export interface Message {
  id: string;
  type: 'user' | 'bot' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  toolName?: string;
}

export interface WSMessage {
  type: 'user_message' | 'bot_message' | 'bot_typing' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'connected' | 'history' | 'usage';
  payload: any;
  timestamp?: string;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
