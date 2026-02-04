import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

import { manageConversationsHandler, manageConversationsDefinition } from '../../manage-conversations.js';

describe('manage_conversations tool', () => {
  let ctx: ToolContext;

  const mockAiConsultant = {
    listConversations: vi.fn().mockReturnValue([]),
    getConversation: vi.fn(),
    deleteConversation: vi.fn(),
    clearConversations: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAiConsultant.listConversations.mockReturnValue([]);
    mockAiConsultant.getConversation.mockReturnValue(undefined);
    mockAiConsultant.deleteConversation.mockReturnValue(false);
    ctx = createMockToolContext({ aiConsultant: mockAiConsultant });
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(manageConversationsHandler.name).toBe('manage_conversations');
    });

    it('should expose the definition', () => {
      expect(manageConversationsHandler.definition).toBe(manageConversationsDefinition);
    });

    it('should require the action property', () => {
      expect(manageConversationsDefinition.input_schema.required).toContain('action');
    });
  });

  describe('aiConsultant not configured', () => {
    it('should return error if aiConsultant is null', async () => {
      const ctxNoConsultant = createMockToolContext({ aiConsultant: null });

      const result = await manageConversationsHandler.execute({ action: 'list' }, ctxNoConsultant);

      expect(result.success).toBe(false);
      expect(result.error).toContain('AI Consultant non configur');
    });
  });

  describe('list action', () => {
    it('should call aiConsultant.listConversations and return formatted list', async () => {
      mockAiConsultant.listConversations.mockReturnValue([
        {
          id: 'conv-1',
          model: 'mistral-large',
          messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }],
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
          metadata: { topic: 'test' },
        },
        {
          id: 'conv-2',
          model: 'grok',
          messages: [],
          createdAt: '2024-02-01',
          updatedAt: '2024-02-01',
          metadata: {},
        },
      ]);

      const result = await manageConversationsHandler.execute({ action: 'list' }, ctx);

      expect(result.success).toBe(true);
      expect(mockAiConsultant.listConversations).toHaveBeenCalled();
      expect(result.conversations).toHaveLength(2);
      expect(result.conversations[0]).toEqual({
        id: 'conv-1',
        model: 'mistral-large',
        message_count: 2,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        metadata: { topic: 'test' },
      });
      expect(result.conversations[1]).toEqual({
        id: 'conv-2',
        model: 'grok',
        message_count: 0,
        created_at: '2024-02-01',
        updated_at: '2024-02-01',
        metadata: {},
      });
      expect(result.count).toBe(2);
    });

    it('should return empty list when no conversations exist', async () => {
      mockAiConsultant.listConversations.mockReturnValue([]);

      const result = await manageConversationsHandler.execute({ action: 'list' }, ctx);

      expect(result.success).toBe(true);
      expect(result.conversations).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('get action', () => {
    it('should return conversation details when found', async () => {
      const conversationData = {
        id: 'conv-1',
        model: 'mistral-large',
        messages: [{ role: 'user', content: 'hello' }],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        metadata: { topic: 'test' },
      };
      mockAiConsultant.getConversation.mockReturnValue(conversationData);

      const result = await manageConversationsHandler.execute(
        { action: 'get', conversation_id: 'conv-1' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(mockAiConsultant.getConversation).toHaveBeenCalledWith('conv-1');
      expect(result.conversation).toEqual({
        id: 'conv-1',
        model: 'mistral-large',
        messages: [{ role: 'user', content: 'hello' }],
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        metadata: { topic: 'test' },
      });
    });

    it('should return error if conversation not found', async () => {
      mockAiConsultant.getConversation.mockReturnValue(null);

      const result = await manageConversationsHandler.execute(
        { action: 'get', conversation_id: 'nonexistent' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
      expect(result.error).toContain('non trouv');
    });

    it('should return error if no conversation_id provided', async () => {
      const result = await manageConversationsHandler.execute({ action: 'get' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('conversation_id');
      expect(result.error).toContain('requis');
    });
  });

  describe('delete action', () => {
    it('should delete conversation and return success', async () => {
      mockAiConsultant.deleteConversation.mockReturnValue(true);

      const result = await manageConversationsHandler.execute(
        { action: 'delete', conversation_id: 'conv-1' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(mockAiConsultant.deleteConversation).toHaveBeenCalledWith('conv-1');
      expect(result.message).toContain('conv-1');
      expect(result.message).toContain('supprim');
    });

    it('should return error if conversation not found (returns false)', async () => {
      mockAiConsultant.deleteConversation.mockReturnValue(false);

      const result = await manageConversationsHandler.execute(
        { action: 'delete', conversation_id: 'nonexistent' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
      expect(result.error).toContain('non trouv');
    });

    it('should return error if no conversation_id provided', async () => {
      const result = await manageConversationsHandler.execute({ action: 'delete' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('conversation_id');
      expect(result.error).toContain('requis');
    });
  });

  describe('clear action', () => {
    it('should call clearConversations and return success', async () => {
      const result = await manageConversationsHandler.execute({ action: 'clear' }, ctx);

      expect(result.success).toBe(true);
      expect(mockAiConsultant.clearConversations).toHaveBeenCalled();
      expect(result.message).toContain('supprim');
    });
  });

  describe('unknown action', () => {
    it('should return error for unknown action', async () => {
      const result = await manageConversationsHandler.execute({ action: 'unknown_action' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Action inconnue');
      expect(result.error).toContain('unknown_action');
    });
  });

  describe('error handling', () => {
    it('should catch errors and return formatted error message', async () => {
      mockAiConsultant.listConversations.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const result = await manageConversationsHandler.execute({ action: 'list' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Erreur gestion conversations');
      expect(result.error).toContain('Database connection failed');
    });
  });
});
