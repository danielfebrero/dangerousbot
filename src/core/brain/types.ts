/**
 * Types partagés pour le module Brain
 */

import { AIMessage, AIContentBlock, AIResponse, AIProvider } from '../providers/index.js';
import { Tool, BrainResponse } from '../types.js';
import { ProviderType } from '../../config.js';

export interface BrainConfig {
  anthropicKey: string;
  kimiKey?: string;
  openRouterKey?: string;
  identityPath?: string;
}

export interface ApiKeys {
  anthropic: string;
  kimi?: string;
  mistral?: string;
  grok?: string;
  openRouter?: string;
}

export interface StreamCallback {
  (event: StreamEvent): void;
}

export interface StreamEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'done';
  text?: string;
  toolUse?: {
    id: string;
    name: string;
    input: any;
  };
  error?: string;
}

export interface ProviderSwitchInfo {
  from: ProviderType;
  to: ProviderType;
  reason: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export {
  AIMessage,
  AIContentBlock,
  AIResponse,
  AIProvider,
  Tool,
  BrainResponse,
  ProviderType
};
