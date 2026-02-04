/**
 * Unit tests for Telegram formatters
 */

import { describe, it, expect } from 'vitest';
import {
  getToolEmoji,
  formatToolBadge,
  formatToolBadges,
  splitMessage,
  escapeMarkdown,
  formatCodeBlock,
  bold,
  italic,
  code,
} from '../../formatters.js';

describe('Telegram Formatters', () => {
  describe('getToolEmoji', () => {
    it('should return emoji for known tools', () => {
      expect(getToolEmoji('execute_code')).toBe('💻');
      expect(getToolEmoji('shell')).toBe('🐚');
      expect(getToolEmoji('read_file')).toBe('📄');
      expect(getToolEmoji('remember')).toBe('🧠');
    });

    it('should return default emoji for unknown tools', () => {
      expect(getToolEmoji('unknown_tool')).toBe('🔧');
    });
  });

  describe('formatToolBadge', () => {
    it('should format success badge', () => {
      const badge = formatToolBadge('read_file', true);
      expect(badge).toContain('read_file');
      expect(badge).toContain('✓');
      expect(badge).toContain('📄');
    });

    it('should format failure badge', () => {
      const badge = formatToolBadge('shell', false);
      expect(badge).toContain('shell');
      expect(badge).toContain('✗');
    });
  });

  describe('formatToolBadges', () => {
    it('should format multiple badges with separator', () => {
      const result = formatToolBadges([
        { name: 'read_file', success: true },
        { name: 'shell', success: false },
      ]);
      expect(result).toContain('🔧');
      expect(result).toContain('|');
      expect(result).toContain('read_file');
      expect(result).toContain('shell');
    });

    it('should handle empty array', () => {
      const result = formatToolBadges([]);
      expect(result).toContain('🔧');
    });
  });

  describe('splitMessage', () => {
    it('should return single part for short messages', () => {
      const parts = splitMessage('Hello world');
      expect(parts).toHaveLength(1);
      expect(parts[0]).toBe('Hello world');
    });

    it('should split long messages at line boundaries', () => {
      const lines = Array.from({ length: 200 }, (_, i) => `Line ${i}: ${'x'.repeat(30)}`);
      const text = lines.join('\n');
      const parts = splitMessage(text, 500);
      expect(parts.length).toBeGreaterThan(1);
      // Each part should not exceed max length
      for (const part of parts) {
        expect(part.length).toBeLessThanOrEqual(500);
      }
    });

    it('should handle single very long line', () => {
      const longLine = 'x'.repeat(1000);
      const parts = splitMessage(longLine, 200);
      expect(parts.length).toBeGreaterThan(1);
      for (const part of parts) {
        expect(part.length).toBeLessThanOrEqual(200);
      }
    });

    it('should preserve content across splits', () => {
      const text = 'line1\nline2\nline3';
      const parts = splitMessage(text, 10);
      const rejoined = parts.join('\n');
      expect(rejoined).toContain('line1');
      expect(rejoined).toContain('line2');
      expect(rejoined).toContain('line3');
    });

    it('should use default max length', () => {
      // Default is TELEGRAM_SAFE_LIMIT (4000)
      const shortText = 'short';
      expect(splitMessage(shortText)).toEqual([shortText]);
    });
  });

  describe('escapeMarkdown', () => {
    it('should escape special characters', () => {
      expect(escapeMarkdown('hello_world')).toBe('hello\\_world');
      expect(escapeMarkdown('*bold*')).toBe('\\*bold\\*');
      expect(escapeMarkdown('code `here`')).toBe('code \\`here\\`');
    });

    it('should handle text without special chars', () => {
      expect(escapeMarkdown('normal text')).toBe('normal text');
    });

    it('should escape multiple special chars', () => {
      const result = escapeMarkdown('[link](url)');
      expect(result).toBe('\\[link\\]\\(url\\)');
    });
  });

  describe('formatCodeBlock', () => {
    it('should format code block with language', () => {
      const result = formatCodeBlock('const x = 1;', 'typescript');
      expect(result).toBe('```typescript\nconst x = 1;\n```');
    });

    it('should format code block without language', () => {
      const result = formatCodeBlock('some code');
      expect(result).toBe('```\nsome code\n```');
    });
  });

  describe('bold', () => {
    it('should wrap text in asterisks', () => {
      expect(bold('text')).toBe('*text*');
    });
  });

  describe('italic', () => {
    it('should wrap text in underscores', () => {
      expect(italic('text')).toBe('_text_');
    });
  });

  describe('code', () => {
    it('should wrap text in backticks', () => {
      expect(code('text')).toBe('`text`');
    });
  });
});
