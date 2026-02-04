/**
 * Unit tests for log, set_log_level, and clear_logs tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    getRecentLogs: vi.fn().mockReturnValue([]),
    getLevel: vi.fn().mockReturnValue('INFO'),
    setLevel: vi.fn(),
    clearLogs: vi.fn(),
    getJsonLogPath: vi.fn().mockReturnValue('/tmp/logs.json'),
    getTextLogPath: vi.fn().mockReturnValue('/tmp/logs.txt'),
  },
}));

vi.mock('../../../logger.js', () => ({
  logger: mockLogger,
}));

import { logHandler, setLogLevelHandler, clearLogsHandler } from '../../log.js';

describe('log tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.getRecentLogs.mockReturnValue([]);
    mockLogger.getLevel.mockReturnValue('INFO');
    mockLogger.getJsonLogPath.mockReturnValue('/tmp/logs.json');
    mockLogger.getTextLogPath.mockReturnValue('/tmp/logs.txt');
  });

  it('should have the correct name', () => {
    expect(logHandler.name).toBe('log');
  });

  it('should retrieve logs with defaults (level=INFO, count=50)', async () => {
    mockLogger.getRecentLogs.mockReturnValue([]);

    const result = await logHandler.execute({});

    expect(result.success).toBe(true);
    expect(mockLogger.getRecentLogs).toHaveBeenCalledWith(100, 'INFO'); // count*2 = 50*2
    expect(result.data.level).toBe('INFO');
    expect(result.data.total).toBe(0);
    expect(result.data.currentLogLevel).toBe('INFO');
    expect(result.data.paths.json).toBe('/tmp/logs.json');
    expect(result.data.paths.text).toBe('/tmp/logs.txt');
  });

  it('should filter by module', async () => {
    mockLogger.getRecentLogs.mockReturnValue([
      { timestamp: '2025-01-01T00:00:00Z', level: 'INFO', module: 'Brain', message: 'thinking', data: null },
      { timestamp: '2025-01-01T00:00:01Z', level: 'INFO', module: 'Server', message: 'listening', data: null },
      { timestamp: '2025-01-01T00:00:02Z', level: 'INFO', module: 'Brain', message: 'done', data: null },
    ]);

    const result = await logHandler.execute({ module: 'brain' });

    expect(result.success).toBe(true);
    expect(result.data.total).toBe(2);
    expect(result.data.logs.every((l: any) => l.module === 'Brain')).toBe(true);
  });

  it('should filter by search term in message', async () => {
    mockLogger.getRecentLogs.mockReturnValue([
      { timestamp: '2025-01-01T00:00:00Z', level: 'INFO', module: 'Server', message: 'Connection established', data: null },
      { timestamp: '2025-01-01T00:00:01Z', level: 'ERROR', module: 'Server', message: 'Connection refused', data: null },
      { timestamp: '2025-01-01T00:00:02Z', level: 'INFO', module: 'Brain', message: 'Processing query', data: null },
    ]);

    const result = await logHandler.execute({ search: 'connection' });

    expect(result.success).toBe(true);
    expect(result.data.total).toBe(2);
  });

  it('should filter by search term in data', async () => {
    mockLogger.getRecentLogs.mockReturnValue([
      { timestamp: '2025-01-01T00:00:00Z', level: 'INFO', module: 'Brain', message: 'result', data: { keyword: 'special-token' } },
      { timestamp: '2025-01-01T00:00:01Z', level: 'INFO', module: 'Brain', message: 'other', data: null },
    ]);

    const result = await logHandler.execute({ search: 'special-token' });

    expect(result.success).toBe(true);
    expect(result.data.total).toBe(1);
  });

  it('should clamp count to minimum of 1', async () => {
    mockLogger.getRecentLogs.mockReturnValue([]);

    await logHandler.execute({ count: -5 });

    // Math.max(-5 || 50, 1) => Math.max(50, 1) => 50, then *2 = 100
    // Actually: input.count is -5, so Math.max(-5, 1) = 1, then *2 = 2
    // Wait: Math.min(Math.max(-5 || 50, 1), 1000) => -5 is truthy, so Math.max(-5, 1) = 1
    expect(mockLogger.getRecentLogs).toHaveBeenCalledWith(2, 'INFO'); // 1*2 = 2
  });

  it('should clamp count to maximum of 1000', async () => {
    mockLogger.getRecentLogs.mockReturnValue([]);

    await logHandler.execute({ count: 5000 });

    expect(mockLogger.getRecentLogs).toHaveBeenCalledWith(2000, 'INFO'); // 1000*2 = 2000
  });

  it('should use default count of 50 when count is 0 (falsy)', async () => {
    mockLogger.getRecentLogs.mockReturnValue([]);

    await logHandler.execute({ count: 0 });

    // 0 is falsy, so (0 || 50) = 50, Math.min(Math.max(50, 1), 1000) = 50, *2 = 100
    expect(mockLogger.getRecentLogs).toHaveBeenCalledWith(100, 'INFO');
  });

  it('should limit results to requested count after filtering', async () => {
    const logs = Array.from({ length: 10 }, (_, i) => ({
      timestamp: `2025-01-01T00:00:${String(i).padStart(2, '0')}Z`,
      level: 'INFO',
      module: 'Test',
      message: `Log entry ${i}`,
      data: null,
    }));
    mockLogger.getRecentLogs.mockReturnValue(logs);

    const result = await logHandler.execute({ count: 3 });

    expect(result.data.total).toBe(3);
    // Should return the last 3 entries (slice(-count))
    expect(result.data.logs[0].message).toBe('Log entry 7');
    expect(result.data.logs[2].message).toBe('Log entry 9');
  });

  it('should handle errors', async () => {
    mockLogger.getRecentLogs.mockImplementation(() => {
      throw new Error('Log file corrupted');
    });

    const result = await logHandler.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Erreur lors de la récupération des logs');
    expect(result.error).toContain('Log file corrupted');
  });

  it('should format log entries correctly', async () => {
    mockLogger.getRecentLogs.mockReturnValue([
      {
        timestamp: '2025-01-01T12:30:00Z',
        level: 'WARN',
        module: 'Memory',
        message: 'High memory usage',
        data: { usage: '95%' },
      },
    ]);

    const result = await logHandler.execute({ level: 'WARN' });

    expect(result.success).toBe(true);
    const log = result.data.logs[0];
    expect(log.timestamp).toBe('2025-01-01T12:30:00Z');
    expect(log.level).toBe('WARN');
    expect(log.module).toBe('Memory');
    expect(log.message).toBe('High memory usage');
    expect(log.data).toEqual({ usage: '95%' });
  });
});

describe('set_log_level tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.getLevel.mockReturnValue('INFO');
  });

  it('should have the correct name', () => {
    expect(setLogLevelHandler.name).toBe('set_log_level');
  });

  it('should change log level successfully', async () => {
    mockLogger.getLevel.mockReturnValue('INFO');

    const result = await setLogLevelHandler.execute({ level: 'DEBUG' });

    expect(result.success).toBe(true);
    expect(mockLogger.setLevel).toHaveBeenCalledWith('DEBUG');
    expect(result.data.previousLevel).toBe('INFO');
    expect(result.data.currentLevel).toBe('DEBUG');
    expect(result.message).toContain('INFO');
    expect(result.message).toContain('DEBUG');
  });

  it('should return error for invalid log level', async () => {
    const result = await setLogLevelHandler.execute({ level: 'INVALID' as any });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Niveau de log invalide');
    expect(result.error).toContain('INVALID');
    expect(mockLogger.setLevel).not.toHaveBeenCalled();
  });

  it('should accept all valid log levels', async () => {
    const validLevels = ['VERBOSE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT'];

    for (const level of validLevels) {
      vi.clearAllMocks();
      mockLogger.getLevel.mockReturnValue('INFO');

      const result = await setLogLevelHandler.execute({ level: level as any });

      expect(result.success).toBe(true);
      expect(mockLogger.setLevel).toHaveBeenCalledWith(level);
    }
  });
});

describe('clear_logs tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have the correct name', () => {
    expect(clearLogsHandler.name).toBe('clear_logs');
  });

  it('should clear logs successfully', async () => {
    const result = await clearLogsHandler.execute({});

    expect(result.success).toBe(true);
    expect(result.message).toContain('effacés');
    expect(mockLogger.clearLogs).toHaveBeenCalled();
  });

  it('should handle errors', async () => {
    mockLogger.clearLogs.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = await clearLogsHandler.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toContain("Erreur lors de l'effacement des logs");
    expect(result.error).toContain('Permission denied');
  });
});
