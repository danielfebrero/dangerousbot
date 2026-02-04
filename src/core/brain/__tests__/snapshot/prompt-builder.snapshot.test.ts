/**
 * Snapshot tests for PromptBuilder system prompt generation
 *
 * These tests verify that the system prompt structure doesn't change
 * unexpectedly. Update snapshots with: npx vitest run --update
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue('You are DangerousBot, an AI assistant.'),
}));

vi.mock('../../../context-injector.js', () => ({
  ContextInjector: vi.fn(),
  getContextInjector: vi.fn(),
}));

vi.mock('../../../../config.js', () => ({
  PROVIDER: { ACTIVE: 'claude' },
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { PromptBuilder } from '../../prompt-builder.js';

describe('PromptBuilder Snapshots', () => {
  describe('getSystemPrompt structure', () => {
    it('should produce consistent webapp prompt', () => {
      const builder = new PromptBuilder('/fake/identity.md');
      const prompt = builder.getSystemPrompt('webapp');

      // Verify structure contains expected sections
      expect(prompt).toContain('You are DangerousBot');
      expect(prompt).toMatch(/\d{4}/); // Should contain a year (timestamp)

      // Snapshot the overall structure (without timestamp which changes)
      const normalized = prompt
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '[TIMESTAMP]')
        .replace(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*\w*/g, '[DATETIME]')
        .replace(/\d{2}:\d{2}:\d{2}/g, '[TIME]')
        .replace(/\d{4}-\d{2}-\d{2}/g, '[DATE]');

      expect(normalized).toMatchSnapshot();
    });

    it('should produce consistent telegram prompt', () => {
      const builder = new PromptBuilder('/fake/identity.md');
      const prompt = builder.getSystemPrompt('telegram');

      const normalized = prompt
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '[TIMESTAMP]')
        .replace(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*\w*/g, '[DATETIME]')
        .replace(/\d{2}:\d{2}:\d{2}/g, '[TIME]')
        .replace(/\d{4}-\d{2}-\d{2}/g, '[DATE]');

      expect(normalized).toMatchSnapshot();
    });

    it('should produce consistent default prompt', () => {
      const builder = new PromptBuilder('/fake/identity.md');
      const prompt = builder.getSystemPrompt();

      const normalized = prompt
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '[TIMESTAMP]')
        .replace(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*\w*/g, '[DATETIME]')
        .replace(/\d{2}:\d{2}:\d{2}/g, '[TIME]')
        .replace(/\d{4}-\d{2}-\d{2}/g, '[DATE]');

      expect(normalized).toMatchSnapshot();
    });
  });

  describe('identity loading', () => {
    it('should produce consistent base identity', () => {
      const builder = new PromptBuilder('/fake/identity.md');
      expect(builder.getBaseIdentity()).toMatchSnapshot();
    });
  });
});
