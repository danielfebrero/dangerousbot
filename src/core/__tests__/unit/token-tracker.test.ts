/**
 * Unit tests for TokenTracker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('../../thread-manager', () => ({
  getThreadManager: vi.fn(() => ({
    getThreadMessages: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { TokenTracker, initTokenTracker } from '../../token-tracker.js';
import { getThreadManager } from '../../thread-manager.js';

describe('TokenTracker', () => {
  let tracker: TokenTracker;

  beforeEach(() => {
    tracker = new TokenTracker(128000);
  });

  describe('constructor', () => {
    it('should use default context limit of 128000', () => {
      const t = new TokenTracker();
      const stats = t.getStats('thread-1');
      expect(stats.contextLimit).toBe(128000);
    });

    it('should accept custom context limit', () => {
      const t = new TokenTracker(64000);
      const stats = t.getStats('thread-1');
      expect(stats.contextLimit).toBe(64000);
    });
  });

  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(tracker.estimateTokens('')).toBe(0);
    });

    it('should return 0 for null/undefined', () => {
      expect(tracker.estimateTokens(null as any)).toBe(0);
      expect(tracker.estimateTokens(undefined as any)).toBe(0);
    });

    it('should estimate ~1 token per 4 characters', () => {
      // 8 chars -> ceil(8/4) = 2 tokens
      expect(tracker.estimateTokens('abcdefgh')).toBe(2);
    });

    it('should ceil the result', () => {
      // 5 chars -> ceil(5/4) = 2 tokens
      expect(tracker.estimateTokens('hello')).toBe(2);
    });

    it('should handle long strings', () => {
      const text = 'a'.repeat(1000);
      expect(tracker.estimateTokens(text)).toBe(250);
    });
  });

  describe('recordApiCall', () => {
    it('should create state for new thread', () => {
      tracker.recordApiCall('thread-1', 100, 50);
      const stats = tracker.getStats('thread-1');
      expect(stats.sessionInputTokens).toBe(100);
      expect(stats.sessionOutputTokens).toBe(50);
    });

    it('should accumulate tokens across calls', () => {
      tracker.recordApiCall('thread-1', 100, 50);
      tracker.recordApiCall('thread-1', 200, 100);
      const stats = tracker.getStats('thread-1');
      expect(stats.sessionInputTokens).toBe(300);
      expect(stats.sessionOutputTokens).toBe(150);
    });

    it('should track last request tokens separately', () => {
      tracker.recordApiCall('thread-1', 100, 50);
      tracker.recordApiCall('thread-1', 200, 100);
      const stats = tracker.getStats('thread-1');
      expect(stats.lastRequestInputTokens).toBe(200);
      expect(stats.lastRequestOutputTokens).toBe(100);
    });

    it('should use provided cost when available', () => {
      const cost = { input_cost: 0.01, output_cost: 0.05, total_cost: 0.06 };
      tracker.recordApiCall('thread-1', 100, 50, cost);
      const stats = tracker.getStats('thread-1');
      expect(stats.sessionTotalCost).toBe(0.06);
      expect(stats.lastRequestCost).toBe(0.06);
    });

    it('should calculate cost when not provided', () => {
      tracker.setCostConfig(15.0, 75.0);
      tracker.recordApiCall('thread-1', 1_000_000, 100_000);
      const stats = tracker.getStats('thread-1');
      // 1M input * $15/M + 100K output * $75/M = $15 + $7.5 = $22.5
      expect(stats.sessionTotalCost).toBeCloseTo(22.5, 2);
    });

    it('should isolate stats per thread', () => {
      tracker.recordApiCall('thread-1', 100, 50);
      tracker.recordApiCall('thread-2', 200, 100);
      expect(tracker.getStats('thread-1').sessionInputTokens).toBe(100);
      expect(tracker.getStats('thread-2').sessionInputTokens).toBe(200);
    });
  });

  describe('setCostConfig', () => {
    it('should change cost calculation', () => {
      tracker.setCostConfig(10.0, 30.0);
      tracker.recordApiCall('thread-1', 1_000_000, 1_000_000);
      const stats = tracker.getStats('thread-1');
      // 1M * $10/M + 1M * $30/M = $40
      expect(stats.sessionTotalCost).toBeCloseTo(40.0, 2);
    });
  });

  describe('getStats', () => {
    it('should return zero stats for unknown thread', () => {
      const stats = tracker.getStats('unknown');
      expect(stats.sessionInputTokens).toBe(0);
      expect(stats.sessionOutputTokens).toBe(0);
      expect(stats.sessionTotalCost).toBe(0);
      expect(stats.lastRequestInputTokens).toBe(0);
      expect(stats.lastRequestOutputTokens).toBe(0);
      expect(stats.lastRequestCost).toBe(0);
    });

    it('should include context limit and usage percent', () => {
      const stats = tracker.getStats('thread-1');
      expect(stats.contextLimit).toBe(128000);
      expect(stats.contextUsagePercent).toBeGreaterThanOrEqual(0);
      expect(stats.contextUsagePercent).toBeLessThanOrEqual(100);
    });
  });

  describe('getStatsWithPending', () => {
    it('should add pending tokens to session totals', () => {
      tracker.recordApiCall('thread-1', 100, 50);
      const stats = tracker.getStatsWithPending('thread-1', 200, 100);
      expect(stats.sessionInputTokens).toBe(300);
      expect(stats.sessionOutputTokens).toBe(150);
    });

    it('should set pending tokens as last request', () => {
      const stats = tracker.getStatsWithPending('thread-1', 200, 100);
      expect(stats.lastRequestInputTokens).toBe(200);
      expect(stats.lastRequestOutputTokens).toBe(100);
    });

    it('should calculate pending cost', () => {
      tracker.setCostConfig(15.0, 75.0);
      const stats = tracker.getStatsWithPending('thread-1', 1_000_000, 100_000);
      expect(stats.lastRequestCost).toBeCloseTo(22.5, 2);
    });
  });

  describe('estimateContextTokens', () => {
    it('should return 0 if threadManager throws', () => {
      vi.mocked(getThreadManager).mockImplementation(() => {
        throw new Error('Not initialized');
      });
      expect(tracker.estimateContextTokens('thread-1')).toBe(0);
    });

    it('should estimate tokens from thread messages', () => {
      vi.mocked(getThreadManager).mockReturnValue({
        getThreadMessages: vi.fn().mockReturnValue([
          { content: 'Hello world', toolCalls: null },
          { content: 'Response here', toolCalls: null },
        ]),
      } as any);

      const tokens = tracker.estimateContextTokens('thread-1');
      // 2 messages * (content tokens + 10 overhead) + 2000 system prompt
      expect(tokens).toBeGreaterThan(2000);
    });

    it('should include tool_calls in estimation', () => {
      vi.mocked(getThreadManager).mockReturnValue({
        getThreadMessages: vi.fn().mockReturnValue([
          {
            content: 'Call tool',
            toolCalls: [{ name: 'read_file', input: { path: '/test.ts' } }],
          },
        ]),
      } as any);

      const tokens = tracker.estimateContextTokens('thread-1');
      expect(tokens).toBeGreaterThan(2000); // At least system prompt overhead
    });
  });

  describe('clearThread', () => {
    it('should remove thread stats', () => {
      tracker.recordApiCall('thread-1', 100, 50);
      tracker.clearThread('thread-1');
      const stats = tracker.getStats('thread-1');
      expect(stats.sessionInputTokens).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('should remove all thread stats', () => {
      tracker.recordApiCall('thread-1', 100, 50);
      tracker.recordApiCall('thread-2', 200, 100);
      tracker.clearAll();
      expect(tracker.getStats('thread-1').sessionInputTokens).toBe(0);
      expect(tracker.getStats('thread-2').sessionInputTokens).toBe(0);
    });
  });

  describe('initTokenTracker', () => {
    it('should create a new singleton with custom limit', () => {
      const t = initTokenTracker(64000);
      const stats = t.getStats('thread-1');
      expect(stats.contextLimit).toBe(64000);
    });
  });
});
