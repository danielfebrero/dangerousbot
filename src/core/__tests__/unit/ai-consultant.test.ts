/**
 * Unit tests for AIConsultant
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = {
  prepare: vi.fn().mockReturnThis(),
  run: vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
  get: vi.fn(),
  all: vi.fn().mockReturnValue([]),
};

vi.mock('../../../database/index.js', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

vi.mock('../../../config.js', () => ({
  TOKENS: { MAX_CONSULT_AI_RESPONSE: 4000 },
  MODELS: {
    MISTRAL_LARGE: 'mistral-large',
    MISTRAL_MEDIUM: 'mistral-medium',
    MISTRAL_SMALL: 'mistral-small',
    GROK_REASONING: 'grok-reasoning',
    GROK_NON_REASONING: 'grok-non-reasoning',
  },
  APIS: { MISTRAL_API_KEY: '', GROK_API_KEY: '' },
}));

const mockProvider = {
  chat: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Consultant response' }],
    usage: { input_tokens: 50, output_tokens: 100 },
  }),
};

vi.mock('../../providers/index.js', () => ({
  createProvider: vi.fn(() => mockProvider),
}));

import { AIConsultant } from '../../ai-consultant.js';

describe('AIConsultant', () => {
  let consultant: AIConsultant;

  beforeEach(() => {
    mockDb.get.mockReturnValue(undefined);
    mockDb.all.mockReturnValue([]);
    mockDb.run.mockReturnValue({ lastInsertRowid: 1, changes: 1 });
    mockProvider.chat.mockReset().mockResolvedValue({
      content: [{ type: 'text', text: 'Consultant response' }],
      usage: { input_tokens: 50, output_tokens: 100 },
    });

    consultant = new AIConsultant('mistral-key', 'grok-key');
  });

  describe('isAvailable', () => {
    it('should return true for mistral with key', () => {
      expect(consultant.isAvailable('mistral')).toBe(true);
    });

    it('should return true for grok with key', () => {
      expect(consultant.isAvailable('grok')).toBe(true);
    });

    it('should return false for mistral without key', () => {
      const c = new AIConsultant('', 'grok-key');
      expect(c.isAvailable('mistral')).toBe(false);
    });

    it('should return false for grok without key', () => {
      const c = new AIConsultant('mistral-key', '');
      expect(c.isAvailable('grok')).toBe(false);
    });
  });

  describe('getAvailableModels', () => {
    it('should return both models when both keys present', () => {
      const models = consultant.getAvailableModels();
      expect(models).toContain('mistral');
      expect(models).toContain('grok');
    });

    it('should return only available models', () => {
      const c = new AIConsultant('mistral-key', '');
      const models = c.getAvailableModels();
      expect(models).toContain('mistral');
      expect(models).not.toContain('grok');
    });
  });

  describe('consult', () => {
    it('should call provider and return response', async () => {
      // Mock count query for cleanup
      mockDb.get.mockReturnValue({ count: 0 });

      const result = await consultant.consult({
        query: 'Test question',
        model: 'mistral',
      });

      expect(result.response).toBe('Consultant response');
      expect(result.model).toBe('mistral');
      expect(result.conversationId).toBeDefined();
      expect(result.usage.input_tokens).toBe(50);
    });

    it('should throw when model not available', async () => {
      const c = new AIConsultant('', '');
      await expect(c.consult({ query: 'test', model: 'mistral' })).rejects.toThrow('non disponible');
    });

    it('should use auto complexity by default', async () => {
      mockDb.get.mockReturnValue({ count: 0 });

      const result = await consultant.consult({
        query: 'simple format task',
        model: 'mistral',
      });

      expect(result.modelSize).toBeDefined();
    });
  });

  describe('conversation management', () => {
    it('should return null for non-existent conversation', () => {
      mockDb.get.mockReturnValue(undefined);
      const conv = consultant.getConversation('nonexistent');
      expect(conv).toBeNull();
    });

    it('should list conversations', () => {
      mockDb.all.mockReturnValue([]);
      const convs = consultant.listConversations();
      expect(Array.isArray(convs)).toBe(true);
    });

    it('should delete conversation', () => {
      mockDb.run.mockReturnValue({ changes: 1 });
      const result = consultant.deleteConversation('conv-1');
      expect(result).toBe(true);
    });

    it('should clear conversations', () => {
      expect(() => consultant.clearConversations()).not.toThrow();
    });
  });

  describe('shortcut methods', () => {
    beforeEach(() => {
      mockDb.get.mockReturnValue({ count: 0 });
    });

    it('reviewCode should call consult with high complexity', async () => {
      const result = await consultant.reviewCode('const x = 1;', 'typescript');
      expect(result.response).toBe('Consultant response');
    });

    it('brainstorm should call consult with medium complexity', async () => {
      const result = await consultant.brainstorm('new feature ideas');
      expect(result.response).toBe('Consultant response');
    });

    it('quickTask should call consult with low complexity', async () => {
      const result = await consultant.quickTask('format this JSON');
      expect(result.response).toBe('Consultant response');
    });

    it('validate should call consult with medium complexity', async () => {
      const result = await consultant.validate('Use Redux for state management');
      expect(result.response).toBe('Consultant response');
    });
  });
});
