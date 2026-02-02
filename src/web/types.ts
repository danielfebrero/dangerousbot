export interface ToolCall {
  name: string;
  input: unknown;
}

export interface ToolCallExecution {
  id: string;
  toolName: string;
  input: unknown;
  status: 'running' | 'completed' | 'warning' | 'error';
  output?: unknown;
  error?: string;
  warning?: string;
  startTime: Date;
  endTime?: Date;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface TextContent {
  type: 'text';
  text: string;
}

export type ContentPart = TextContent | ImageContent;

export interface Message {
  id: string;
  type: 'user' | 'bot' | 'system' | 'tool' | 'provider_switch' | 'tool_execution';
  content: string;
  contentParts?: ContentPart[];
  timestamp: Date;
  toolName?: string;
  toolCalls?: ToolCall[];
  toolExecution?: ToolCallExecution;
  providerSwitch?: {
    from: string;
    to: string;
    reason: string;
  };
  source?: 'webapp' | 'telegram';
  forceRestart?: boolean; // Pour afficher le bouton de force restart
}

export interface WSMessage {
  type: 'user_message' | 'bot_message' | 'bot_typing' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'connected' | 'history' | 'usage' | 'provider_switch' | 'stream_chunk' | 'threads_list' | 'thread_switched' | 'thread_created' | 'thread_renamed' | 'thread_deleted' | 'thread_cleared' | 'restart_signal' | 'force_restart_prompt';
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

// Tool Panel types
export type ToolExecutionStatus = 'running' | 'completed' | 'error';

export interface ToolExecution {
  id: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  status: ToolExecutionStatus;
  startTime: Date;
  endTime?: Date;
  error?: string;
}
