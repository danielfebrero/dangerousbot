/**
 * Unit tests for Telegram constants
 */

import { describe, it, expect } from 'vitest';
import {
  TOOL_EMOJIS,
  DEFAULT_TOOL_EMOJI,
  TELEGRAM_MESSAGE_LIMIT,
  TELEGRAM_SAFE_LIMIT,
  MESSAGES,
  COMMAND_MESSAGES,
} from '../../constants.js';

describe('Telegram Constants', () => {
  describe('TOOL_EMOJIS', () => {
    it('should map known tools to emojis', () => {
      expect(TOOL_EMOJIS.execute_code).toBe('💻');
      expect(TOOL_EMOJIS.shell).toBe('🐚');
      expect(TOOL_EMOJIS.read_file).toBe('📄');
      expect(TOOL_EMOJIS.write_file).toBe('📝');
      expect(TOOL_EMOJIS.edit_file).toBe('✏️');
      expect(TOOL_EMOJIS.delete_file).toBe('🗑️');
      expect(TOOL_EMOJIS.remember).toBe('🧠');
      expect(TOOL_EMOJIS.recall).toBe('📚');
      expect(TOOL_EMOJIS.self_update).toBe('🔄');
      expect(TOOL_EMOJIS.searxng_search).toBe('🔍');
    });

    it('should have no undefined values', () => {
      for (const [key, value] of Object.entries(TOOL_EMOJIS)) {
        expect(value, `TOOL_EMOJIS.${key}`).toBeDefined();
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    });
  });

  describe('DEFAULT_TOOL_EMOJI', () => {
    it('should be a wrench emoji', () => {
      expect(DEFAULT_TOOL_EMOJI).toBe('🔧');
    });
  });

  describe('TELEGRAM_MESSAGE_LIMIT', () => {
    it('should be 4096', () => {
      expect(TELEGRAM_MESSAGE_LIMIT).toBe(4096);
    });
  });

  describe('TELEGRAM_SAFE_LIMIT', () => {
    it('should be less than message limit', () => {
      expect(TELEGRAM_SAFE_LIMIT).toBeLessThan(TELEGRAM_MESSAGE_LIMIT);
    });

    it('should be 4000', () => {
      expect(TELEGRAM_SAFE_LIMIT).toBe(4000);
    });
  });

  describe('MESSAGES', () => {
    it('should have all required message keys', () => {
      expect(MESSAGES.UNAUTHORIZED).toBeDefined();
      expect(MESSAGES.ERROR).toBeDefined();
      expect(MESSAGES.UNKNOWN_MESSAGE_TYPE).toBeDefined();
      expect(MESSAGES.IMAGE_PLACEHOLDER).toBeDefined();
    });

    it('should have non-empty string values', () => {
      for (const [key, value] of Object.entries(MESSAGES)) {
        expect(typeof value, `MESSAGES.${key}`).toBe('string');
        expect(value.length, `MESSAGES.${key}`).toBeGreaterThan(0);
      }
    });
  });

  describe('COMMAND_MESSAGES', () => {
    it('should have all required command message keys', () => {
      expect(COMMAND_MESSAGES.START).toBeDefined();
      expect(COMMAND_MESSAGES.HELP).toBeDefined();
      expect(COMMAND_MESSAGES.WEB).toBeDefined();
    });

    it('should include relevant content in START message', () => {
      expect(COMMAND_MESSAGES.START).toContain('DangerousBot');
    });

    it('should include commands in HELP message', () => {
      expect(COMMAND_MESSAGES.HELP).toContain('/start');
      expect(COMMAND_MESSAGES.HELP).toContain('/status');
      expect(COMMAND_MESSAGES.HELP).toContain('/help');
    });

    it('should include URL in WEB message', () => {
      expect(COMMAND_MESSAGES.WEB).toContain('http://localhost:3000');
    });
  });
});
