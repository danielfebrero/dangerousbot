export interface ToolCall {
  name: string;
  input: unknown;
}

export interface Message {
  id: string;
  type: 'user' | 'bot' | 'system' | 'tool' | 'provider_switch';
  content: string;
  timestamp: Date;
  toolName?: string;
  toolCalls?: ToolCall[];
  providerSwitch?: {
    from: string;
    to: string;
    reason: string;
  };
}

export interface WSMessage {
  type: 'user_message' | 'bot_message' | 'bot_typing' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'connected' | 'history' | 'usage' | 'provider_switch';
  payload: any;
  timestamp?: string;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cost?: {
    input_cost: number;
    output_cost: number;
    total_cost: number;
  };
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
