/**
 * Unit tests for compact tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';

const { mockCompressor, mockGetCompressor } = vi.hoisted(() => ({
  mockCompressor: {
    compressSession: vi.fn(),
    clearCompressedMessages: vi.fn(),
  },
  mockGetCompressor: vi.fn(),
}));

vi.mock('../../../compressor.js', () => ({
  getCompressor: mockGetCompressor,
}));

import { compactHandler } from '../../compact.js';

describe('compact tool', () => {
  let ctx: ReturnType<typeof createMockToolContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockToolContext({ threadId: 'test-thread-1' });
  });

  it('should have the correct name', () => {
    expect(compactHandler.name).toBe('compact');
  });

  it('should return error if compressor is null', async () => {
    mockGetCompressor.mockReturnValue(null);

    const result = await compactHandler.execute({}, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Compressor non initialisé');
  });

  it('should return success with no messages when compressSession returns null', async () => {
    mockGetCompressor.mockReturnValue(mockCompressor);
    mockCompressor.compressSession.mockResolvedValue(null);

    const result = await compactHandler.execute({}, ctx);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Aucun message à compresser');
  });

  it('should compress and clear originals by default', async () => {
    mockGetCompressor.mockReturnValue(mockCompressor);
    mockCompressor.compressSession.mockResolvedValue({
      message_ids: ['msg-1', 'msg-2', 'msg-3'],
      summary: 'This is a summary of the conversation that happened.',
      start_time: '2025-01-01T00:00:00Z',
      end_time: '2025-01-01T01:00:00Z',
    });
    mockCompressor.clearCompressedMessages.mockReturnValue(3);

    const result = await compactHandler.execute({ reason: 'too long' }, ctx);

    expect(result.success).toBe(true);
    expect(result.message).toContain('compressée');
    expect(result.details.messagesCompressed).toBe(3);
    expect(result.details.messagesCleared).toBe(3);
    expect(result.details.reason).toBe('too long');
    expect(result.summary).toBeDefined();
    expect(mockCompressor.compressSession).toHaveBeenCalledWith(undefined, 'test-thread-1');
    expect(mockCompressor.clearCompressedMessages).toHaveBeenCalledWith(undefined, 'test-thread-1');
  });

  it('should preserve originals when clear_originals is false', async () => {
    mockGetCompressor.mockReturnValue(mockCompressor);
    mockCompressor.compressSession.mockResolvedValue({
      message_ids: ['msg-1', 'msg-2'],
      summary: 'Summary text here.',
      start_time: '2025-01-01T00:00:00Z',
      end_time: '2025-01-01T01:00:00Z',
    });

    const result = await compactHandler.execute({ clear_originals: false }, ctx);

    expect(result.success).toBe(true);
    expect(result.details.messagesCleared).toBe(0);
    expect(mockCompressor.clearCompressedMessages).not.toHaveBeenCalled();
  });

  it('should use input thread_id over context threadId', async () => {
    mockGetCompressor.mockReturnValue(mockCompressor);
    mockCompressor.compressSession.mockResolvedValue({
      message_ids: ['msg-1'],
      summary: 'Short summary.',
      start_time: '2025-01-01T00:00:00Z',
      end_time: '2025-01-01T01:00:00Z',
    });
    mockCompressor.clearCompressedMessages.mockReturnValue(1);

    const result = await compactHandler.execute({ thread_id: 'custom-thread-42' }, ctx);

    expect(result.success).toBe(true);
    expect(mockCompressor.compressSession).toHaveBeenCalledWith(undefined, 'custom-thread-42');
    expect(mockCompressor.clearCompressedMessages).toHaveBeenCalledWith(undefined, 'custom-thread-42');
  });

  it('should fall back to context threadId when input thread_id is not provided', async () => {
    mockGetCompressor.mockReturnValue(mockCompressor);
    mockCompressor.compressSession.mockResolvedValue({
      message_ids: ['msg-1'],
      summary: 'Summary.',
      start_time: '2025-01-01T00:00:00Z',
      end_time: '2025-01-01T01:00:00Z',
    });
    mockCompressor.clearCompressedMessages.mockReturnValue(1);

    await compactHandler.execute({}, ctx);

    expect(mockCompressor.compressSession).toHaveBeenCalledWith(undefined, 'test-thread-1');
    expect(mockCompressor.clearCompressedMessages).toHaveBeenCalledWith(undefined, 'test-thread-1');
  });

  it('should truncate long summaries to 500 chars with ellipsis', async () => {
    const longSummary = 'A'.repeat(600);
    mockGetCompressor.mockReturnValue(mockCompressor);
    mockCompressor.compressSession.mockResolvedValue({
      message_ids: ['msg-1'],
      summary: longSummary,
      start_time: '2025-01-01T00:00:00Z',
      end_time: '2025-01-01T01:00:00Z',
    });
    mockCompressor.clearCompressedMessages.mockReturnValue(1);

    const result = await compactHandler.execute({}, ctx);

    expect(result.summary).toHaveLength(503); // 500 + '...'
    expect(result.summary).toMatch(/\.\.\.$/);
  });

  it('should not add ellipsis to short summaries', async () => {
    const shortSummary = 'Short summary.';
    mockGetCompressor.mockReturnValue(mockCompressor);
    mockCompressor.compressSession.mockResolvedValue({
      message_ids: ['msg-1'],
      summary: shortSummary,
      start_time: '2025-01-01T00:00:00Z',
      end_time: '2025-01-01T01:00:00Z',
    });
    mockCompressor.clearCompressedMessages.mockReturnValue(1);

    const result = await compactHandler.execute({}, ctx);

    expect(result.summary).toBe('Short summary.');
  });

  it('should set reason to "non spécifiée" when not provided', async () => {
    mockGetCompressor.mockReturnValue(mockCompressor);
    mockCompressor.compressSession.mockResolvedValue({
      message_ids: ['msg-1'],
      summary: 'Summary.',
      start_time: '2025-01-01T00:00:00Z',
      end_time: '2025-01-01T01:00:00Z',
    });
    mockCompressor.clearCompressedMessages.mockReturnValue(1);

    const result = await compactHandler.execute({}, ctx);

    expect(result.details.reason).toBe('non spécifiée');
  });

  it('should handle errors', async () => {
    mockGetCompressor.mockReturnValue(mockCompressor);
    mockCompressor.compressSession.mockRejectedValue(new Error('Database locked'));

    const result = await compactHandler.execute({}, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Échec de la compression');
    expect(result.error).toContain('Database locked');
  });
});
