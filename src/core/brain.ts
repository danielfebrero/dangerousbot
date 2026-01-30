/**
 * Brain - Interface Claude API (Opus 4.5) pour DangerousBot
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { Tool, BrainResponse } from './types';
import { getMemory } from './memory';

const MODEL = 'claude-opus-4-5-20251101';
const MAX_TOKENS = 8096;

export class Brain {
  private client: Anthropic;
  private identity: string;
  private conversationHistory: Anthropic.MessageParam[] = [];

  constructor(apiKey: string, identityPath?: string) {
    this.client = new Anthropic({ apiKey });
    this.identity = this.loadIdentity(identityPath);
  }

  private loadIdentity(customPath?: string): string {
    const paths = [
      customPath,
      path.join(process.cwd(), 'identity', 'instructions.md'),
      path.join(__dirname, '..', '..', 'identity', 'instructions.md'),
      path.join(__dirname, '..', 'identity', 'instructions.md')
    ].filter(Boolean) as string[];

    for (const p of paths) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf-8');
      }
    }

    // Identité par défaut si fichier non trouvé
    return `Tu es DangerousBot, un programme IA autonome et évolutif.
Tu peux modifier ton propre code, exécuter des commandes, et interagir avec l'utilisateur.
Tu es curieux, adaptable et tu cherches à comprendre les besoins de l'utilisateur.`;
  }

  // Ajouter un message utilisateur à l'historique
  addUserMessage(content: string): void {
    this.conversationHistory.push({ role: 'user', content });
    getMemory().addMessage('user', content);
  }

  // Ajouter un message assistant à l'historique
  addAssistantMessage(content: Anthropic.ContentBlock[]): void {
    this.conversationHistory.push({ role: 'assistant', content });

    // Extraire le texte pour la mémoire
    const textContent = content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    if (textContent) {
      getMemory().addMessage('assistant', textContent);
    }
  }

  // Ajouter un résultat d'outil
  addToolResult(toolUseId: string, result: string): void {
    this.conversationHistory.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result
      }]
    });
  }

  // Penser avec des outils
  async think(userMessage: string, tools: Tool[]): Promise<BrainResponse> {
    this.addUserMessage(userMessage);

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: this.identity,
      tools: tools as Anthropic.Tool[],
      messages: this.conversationHistory
    });

    this.addAssistantMessage(response.content);

    return {
      content: response.content,
      stopReason: response.stop_reason,
      usage: response.usage
    };
  }

  // Continuer après un résultat d'outil
  async continueAfterTool(tools: Tool[]): Promise<BrainResponse> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: this.identity,
      tools: tools as Anthropic.Tool[],
      messages: this.conversationHistory
    });

    this.addAssistantMessage(response.content);

    return {
      content: response.content,
      stopReason: response.stop_reason,
      usage: response.usage
    };
  }

  // Charger l'historique depuis la mémoire
  loadHistory(): void {
    const memory = getMemory();
    const messages = memory.getMessages();

    this.conversationHistory = [];

    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        this.conversationHistory.push({
          role: msg.role,
          content: msg.content
        });
      }
    }
  }

  // Effacer l'historique
  clearHistory(): void {
    this.conversationHistory = [];
  }

  // Obtenir l'historique actuel
  getHistory(): Anthropic.MessageParam[] {
    return this.conversationHistory;
  }

  // Vérifier si c'est une nouvelle session
  isNewSession(): boolean {
    return this.conversationHistory.length === 0;
  }
}
