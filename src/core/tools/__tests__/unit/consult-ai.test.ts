/**
 * Unit tests for consult_ai tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';

vi.mock('../../../tool-cancellation.js', () => ({
  checkCancellation: vi.fn(),
}));

import { consultAIHandler } from '../../consult-ai.js';

describe('consult_ai tool', () => {
  let ctx: ReturnType<typeof createMockToolContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockToolContext();
  });

  it('should have the correct name', () => {
    expect(consultAIHandler.name).toBe('consult_ai');
  });

  it('should return error if aiConsultant is null', async () => {
    ctx = createMockToolContext({ aiConsultant: null });

    const result = await consultAIHandler.execute({ query: 'test question' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('AI Consultant non configuré');
  });

  it('should call aiConsultant.consult with correct params', async () => {
    const mockConsult = vi.fn().mockResolvedValue({
      response: 'answer',
      model: 'mistral-large',
      modelSize: 'large',
      reasoning: null,
      conversationId: 'conv-123',
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    ctx = createMockToolContext({
      aiConsultant: { consult: mockConsult },
    });

    await consultAIHandler.execute(
      {
        query: 'What is the meaning of life?',
        model: 'grok',
        complexity: 'high',
        context: 'philosophical discussion',
        conversation_id: 'conv-abc',
        system_prompt: 'You are a philosopher',
      },
      ctx,
    );

    expect(mockConsult).toHaveBeenCalledWith({
      query: 'What is the meaning of life?',
      model: 'grok',
      complexity: 'high',
      context: 'philosophical discussion',
      conversationId: 'conv-abc',
      systemPrompt: 'You are a philosopher',
    });
  });

  it('should use default model (mistral) and complexity (auto) when not provided', async () => {
    const mockConsult = vi.fn().mockResolvedValue({
      response: 'answer',
      model: 'mistral-large',
      modelSize: 'large',
      reasoning: null,
      conversationId: 'conv-123',
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    ctx = createMockToolContext({
      aiConsultant: { consult: mockConsult },
    });

    await consultAIHandler.execute({ query: 'simple question' }, ctx);

    expect(mockConsult).toHaveBeenCalledWith({
      query: 'simple question',
      model: 'mistral',
      complexity: 'auto',
      context: undefined,
      conversationId: undefined,
      systemPrompt: undefined,
    });
  });

  it('should return formatted result on success', async () => {
    const mockConsult = vi.fn().mockResolvedValue({
      response: 'The answer is 42',
      model: 'mistral-large-latest',
      modelSize: 'large',
      reasoning: 'Deep thought process',
      conversationId: 'conv-456',
      usage: { inputTokens: 15, outputTokens: 25 },
    });

    ctx = createMockToolContext({
      aiConsultant: { consult: mockConsult },
    });

    const result = await consultAIHandler.execute({ query: 'question' }, ctx);

    expect(result.success).toBe(true);
    expect(result.response).toBe('The answer is 42');
    expect(result.model).toBe('mistral-large-latest');
    expect(result.model_size).toBe('large');
    expect(result.reasoning).toBe('Deep thought process');
    expect(result.conversation_id).toBe('conv-456');
    expect(result.usage).toEqual({ inputTokens: 15, outputTokens: 25 });
  });

  it('should handle cancellation errors with "cancelled" in message', async () => {
    const mockConsult = vi.fn().mockRejectedValue(new Error('Request was cancelled by user'));

    ctx = createMockToolContext({
      aiConsultant: { consult: mockConsult },
    });

    const result = await consultAIHandler.execute({ query: 'question' }, ctx);

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.error).toContain('annulée');
  });

  it('should handle cancellation errors with "abort" in message', async () => {
    const mockConsult = vi.fn().mockRejectedValue(new Error('The operation was abort'));

    ctx = createMockToolContext({
      aiConsultant: { consult: mockConsult },
    });

    const result = await consultAIHandler.execute({ query: 'question' }, ctx);

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.error).toContain('annulée');
  });

  it('should handle general errors', async () => {
    const mockConsult = vi.fn().mockRejectedValue(new Error('Network timeout'));

    ctx = createMockToolContext({
      aiConsultant: { consult: mockConsult },
    });

    const result = await consultAIHandler.execute({ query: 'question' }, ctx);

    expect(result.success).toBe(false);
    expect(result.cancelled).toBeUndefined();
    expect(result.error).toContain('Erreur AI consultation');
    expect(result.error).toContain('Network timeout');
  });
});
