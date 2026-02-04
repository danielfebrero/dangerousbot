/**
 * Unit tests for PromptBuilder
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockContextInjector = {
  injectContext: vi.fn().mockResolvedValue('## Injected Context'),
  maybeCompress: vi.fn().mockResolvedValue(false),
};

vi.mock('../../../context-injector.js', () => ({
  getContextInjector: vi.fn(() => mockContextInjector),
}));

vi.mock('../../../../config.js', () => ({
  PROVIDER: { ACTIVE: 'kimi' },
}));

vi.mock('../../../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('Custom identity content'),
}));

import * as fs from 'fs';
import { PromptBuilder } from '../../prompt-builder.js';

describe('PromptBuilder', () => {
  let pb: PromptBuilder;

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    mockContextInjector.injectContext.mockReset().mockResolvedValue('## Injected Context');
    mockContextInjector.maybeCompress.mockReset().mockResolvedValue(false);
    pb = new PromptBuilder();
  });

  describe('constructor', () => {
    it('should use default identity when no file found', () => {
      const identity = pb.getBaseIdentity();
      expect(identity).toContain('DangerousBot');
    });

    it('should load identity from custom path when provided', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const builder = new PromptBuilder('/custom/identity.md');
      const identity = builder.getBaseIdentity();
      expect(identity).toBe('Custom identity content');
    });

    it('should try multiple paths to find identity file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      new PromptBuilder();
      // Should have been called multiple times searching for identity
      expect(fs.existsSync).toHaveBeenCalled();
    });
  });

  describe('getSystemPrompt', () => {
    it('should include the base identity', () => {
      const prompt = pb.getSystemPrompt();
      expect(prompt).toContain('DangerousBot');
    });

    it('should include timestamp section', () => {
      const prompt = pb.getSystemPrompt();
      expect(prompt).toContain('Horodatage');
      expect(prompt).toContain('ISO 8601');
    });

    it('should include source info when provided', () => {
      const prompt = pb.getSystemPrompt('webapp');
      expect(prompt).toContain('webapp');
    });

    it('should include Telegram-specific instructions', () => {
      const prompt = pb.getSystemPrompt('telegram');
      expect(prompt).toContain('Telegram');
      expect(prompt).toContain('concise');
    });

    it('should not include source info when not provided', () => {
      const prompt = pb.getSystemPrompt();
      expect(prompt).not.toContain('Source du message');
    });
  });

  describe('enableContext', () => {
    it('should enable context injection', () => {
      pb.enableContext();
      expect(pb.isContextEnabled()).toBe(true);
    });
  });

  describe('isContextEnabled', () => {
    it('should return false by default', () => {
      expect(pb.isContextEnabled()).toBe(false);
    });
  });

  describe('updateWithContext', () => {
    it('should not inject context when context is disabled', async () => {
      await pb.updateWithContext('Hello');
      const prompt = pb.getSystemPrompt();
      expect(prompt).not.toContain('Injected Context');
    });

    it('should inject context when context is enabled', async () => {
      pb.enableContext();
      await pb.updateWithContext('Hello');
      const prompt = pb.getSystemPrompt();
      expect(prompt).toContain('Injected Context');
    });

    it('should include thread info when threadId is provided', async () => {
      await pb.updateWithContext('Hello', 'thread-1', 'My Thread');
      const prompt = pb.getSystemPrompt();
      expect(prompt).toContain('thread-1');
      expect(prompt).toContain('My Thread');
    });

    it('should include thread section even without context enabled', async () => {
      await pb.updateWithContext('Hello', 'thread-1');
      const prompt = pb.getSystemPrompt();
      expect(prompt).toContain('thread-1');
      expect(prompt).toContain('Thread actuel');
    });

    it('should handle context injection failure gracefully', async () => {
      pb.enableContext();
      mockContextInjector.injectContext.mockRejectedValue(new Error('Network error'));

      // Should not throw
      await pb.updateWithContext('Hello', 'thread-1');

      // Should still have base identity and thread section
      const prompt = pb.getSystemPrompt();
      expect(prompt).toContain('DangerousBot');
      expect(prompt).toContain('thread-1');
    });

    it('should handle null context block', async () => {
      pb.enableContext();
      mockContextInjector.injectContext.mockResolvedValue(null);

      await pb.updateWithContext('Hello');

      const prompt = pb.getSystemPrompt();
      expect(prompt).toContain('DangerousBot');
      expect(prompt).not.toContain('Injected Context');
    });
  });

  describe('maybeCompress', () => {
    it('should return false when context injector is not available', async () => {
      const result = await pb.maybeCompress();
      expect(result).toBe(false);
    });

    it('should delegate to context injector when available', async () => {
      pb.enableContext();
      mockContextInjector.maybeCompress.mockResolvedValue(true);

      const result = await pb.maybeCompress('thread-1');
      expect(result).toBe(true);
      expect(mockContextInjector.maybeCompress).toHaveBeenCalledWith('thread-1');
    });

    it('should handle errors gracefully', async () => {
      pb.enableContext();
      mockContextInjector.maybeCompress.mockRejectedValue(new Error('Compression failed'));

      const result = await pb.maybeCompress();
      expect(result).toBe(false);
    });
  });

  describe('getBaseIdentity', () => {
    it('should return the base identity string', () => {
      const identity = pb.getBaseIdentity();
      expect(typeof identity).toBe('string');
      expect(identity.length).toBeGreaterThan(0);
    });
  });
});
