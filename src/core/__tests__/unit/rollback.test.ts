/**
 * Unit tests for RollbackManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { exec } from 'child_process';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  readdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('../../config.js', () => ({
  ROLLBACK: {
    BACKUP_DIR: '.backups',
    MAX_BACKUPS: 5,
    BUILD_TIMEOUT: 60000,
    HEALTH_CHECK_RETRIES: 3,
    HEALTH_CHECK_INTERVAL: 1000,
  },
}));

import { RollbackManager } from '../../rollback.js';

describe('RollbackManager', () => {
  let manager: RollbackManager;

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as any);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.readFileSync).mockReturnValue('[]');

    manager = new RollbackManager('/project');
  });

  describe('constructor', () => {
    it('should create backup directory if it does not exist', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.backups'),
        expect.objectContaining({ recursive: true })
      );
    });
  });

  describe('listBackups', () => {
    it('should return empty array when no backups', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const backups = manager.listBackups();
      expect(backups).toEqual([]);
    });

    it('should return parsed manifest', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([
        { id: 'backup_1', timestamp: '2025-01-01', description: 'test', files: ['src/main.ts'] },
      ]));

      const backups = manager.listBackups();
      expect(backups).toHaveLength(1);
      expect(backups[0].id).toBe('backup_1');
    });
  });

  describe('createBackup', () => {
    it('should create backup with specified files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('[]');
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, 'abc1234', '');
        return {} as any;
      });

      const result = await manager.createBackup('Test backup', ['src/main.ts']);
      expect(result.success).toBe(true);
      expect(result.backupId).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(fs.mkdirSync).mockImplementation(() => { throw new Error('Permission denied'); });

      const result = await manager.createBackup('Test backup', ['src/main.ts']);
      expect(result.success).toBe(false);
    });
  });

  describe('validateTypes', () => {
    it('should return success when tsc passes', async () => {
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, '', '');
        return {} as any;
      });

      const result = await manager.validateTypes();
      expect(result.success).toBe(true);
    });

    it('should return failure when tsc fails', async () => {
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(new Error('Type error'), '', 'error output');
        return {} as any;
      });

      const result = await manager.validateTypes();
      expect(result.success).toBe(false);
    });
  });

  describe('validateBuild', () => {
    it('should return success when build passes', async () => {
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, 'Build OK', '');
        return {} as any;
      });

      const result = await manager.validateBuild();
      expect(result.success).toBe(true);
    });

    it('should return failure when build fails', async () => {
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(new Error('Build failed'), '', 'error');
        return {} as any;
      });

      const result = await manager.validateBuild();
      expect(result.success).toBe(false);
    });
  });

  describe('restoreBackup', () => {
    it('should return failure when no backups exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = await manager.restoreBackup();
      expect(result.success).toBe(false);
    });

    it('should restore most recent backup', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([
        { id: 'backup_1', timestamp: '2025-01-01', description: 'test', files: ['src/main.ts'] },
      ]));

      const result = await manager.restoreBackup();
      expect(result.success).toBe(true);
      expect(result.backupId).toBe('backup_1');
    });

    it('should return failure for unknown backup ID', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([
        { id: 'backup_1', timestamp: '2025-01-01', description: 'test', files: [] },
      ]));

      const result = await manager.restoreBackup('nonexistent');
      expect(result.success).toBe(false);
    });
  });

  describe('getModifiedFiles', () => {
    it('should return modified source files', async () => {
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, 'src/main.ts\nsrc/core/brain.ts\npackage.json\n', '');
        return {} as any;
      });

      const files = await manager.getModifiedFiles();
      expect(files).toEqual(['src/main.ts', 'src/core/brain.ts']);
    });

    it('should return empty array on git error', async () => {
      vi.mocked(exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(new Error('Not a git repo'), '', '');
        return {} as any;
      });

      const files = await manager.getModifiedFiles();
      expect(files).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should return success when server responds', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '1.0.0' }),
      }));

      const result = await manager.healthCheck(3000, 1);
      expect(result.success).toBe(true);

      vi.unstubAllGlobals();
    });

    it('should return failure after max retries', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

      // Use 1 retry with short interval
      vi.mock('../../config.js', () => ({
        ROLLBACK: {
          BACKUP_DIR: '.backups',
          MAX_BACKUPS: 5,
          BUILD_TIMEOUT: 60000,
          HEALTH_CHECK_RETRIES: 1,
          HEALTH_CHECK_INTERVAL: 10,
        },
      }));

      const result = await manager.healthCheck(3000, 1);
      expect(result.success).toBe(false);

      vi.unstubAllGlobals();
    });
  });
});
