/**
 * Unit tests for Logger
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// Mock fs to prevent real file operations
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(''),
  unlinkSync: vi.fn(),
}));

// Must import after mocking fs
import { logger, LOG_LEVEL_ORDER } from '../../logger.js';
import type { LogLevel } from '../../logger.js';

describe('logger', () => {
  beforeEach(() => {
    logger.setLevel('INFO');
  });

  describe('setLevel / getLevel', () => {
    it('should set and get log level', () => {
      logger.setLevel('DEBUG');
      expect(logger.getLevel()).toBe('DEBUG');
    });

    it('should accept all valid levels', () => {
      const levels: LogLevel[] = ['VERBOSE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT'];
      for (const level of levels) {
        logger.setLevel(level);
        expect(logger.getLevel()).toBe(level);
      }
    });
  });

  describe('LOG_LEVEL_ORDER', () => {
    it('should have correct ordering', () => {
      expect(LOG_LEVEL_ORDER.VERBOSE).toBeLessThan(LOG_LEVEL_ORDER.DEBUG);
      expect(LOG_LEVEL_ORDER.DEBUG).toBeLessThan(LOG_LEVEL_ORDER.INFO);
      expect(LOG_LEVEL_ORDER.INFO).toBeLessThan(LOG_LEVEL_ORDER.WARN);
      expect(LOG_LEVEL_ORDER.WARN).toBeLessThan(LOG_LEVEL_ORDER.ERROR);
      expect(LOG_LEVEL_ORDER.ERROR).toBeLessThan(LOG_LEVEL_ORDER.SILENT);
    });
  });

  describe('log methods', () => {
    it('should not log below current level', () => {
      logger.setLevel('ERROR');
      const consoleSpy = vi.spyOn(console, 'log');
      logger.debug('Test', 'should not appear');
      logger.info('Test', 'should not appear');
      logger.warn('Test', 'should not appear');
      // console.log should not be called for debug/info/warn when level is ERROR
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log at current level', () => {
      logger.setLevel('WARN');
      const consoleSpy = vi.spyOn(console, 'log');
      logger.warn('Test', 'warning message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should write to JSON log file', () => {
      logger.setLevel('INFO');
      logger.info('TestModule', 'test message');
      expect(fs.appendFileSync).toHaveBeenCalled();
    });

    it('should not log when level is SILENT', () => {
      logger.setLevel('SILENT');
      const consoleSpy = vi.spyOn(console, 'log');
      const consoleErrorSpy = vi.spyOn(console, 'error');
      logger.verbose('Test', 'msg');
      logger.debug('Test', 'msg');
      logger.info('Test', 'msg');
      logger.warn('Test', 'msg');
      logger.error('Test', 'msg');
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('error should use console.error', () => {
      logger.setLevel('ERROR');
      const consoleErrorSpy = vi.spyOn(console, 'error');
      logger.error('Test', 'error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('getJsonLogPath / getTextLogPath', () => {
    it('should return string paths', () => {
      expect(typeof logger.getJsonLogPath()).toBe('string');
      expect(typeof logger.getTextLogPath()).toBe('string');
      expect(logger.getJsonLogPath()).toContain('dangerousbot.jsonl');
      expect(logger.getTextLogPath()).toContain('dangerousbot.log');
    });
  });

  describe('getRecentLogs', () => {
    it('should return empty array if log file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const logs = logger.getRecentLogs();
      expect(logs).toEqual([]);
    });

    it('should parse JSON log lines', () => {
      const logEntry = { timestamp: '2025-01-01T00:00:00Z', level: 'INFO', module: 'Test', message: 'hello' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(logEntry) + '\n');
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('hello');
    });

    it('should filter by level', () => {
      const entries = [
        JSON.stringify({ timestamp: '2025-01-01T00:00:00Z', level: 'DEBUG', module: 'Test', message: 'debug' }),
        JSON.stringify({ timestamp: '2025-01-01T00:00:00Z', level: 'ERROR', module: 'Test', message: 'error' }),
      ].join('\n');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(entries);
      const logs = logger.getRecentLogs(100, 'ERROR');
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('error');
    });

    it('should skip malformed lines', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not json\n{"timestamp":"t","level":"INFO","module":"M","message":"ok"}\n');
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
    });
  });

  describe('clearLogs', () => {
    it('should delete log files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      logger.clearLogs();
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should handle missing log files gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(() => logger.clearLogs()).not.toThrow();
    });
  });
});
