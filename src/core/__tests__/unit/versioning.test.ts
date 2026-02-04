/**
 * Unit tests for Versioning
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as child_process from 'child_process';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { Versioning } from '../../versioning.js';

describe('Versioning', () => {
  let versioning: Versioning;

  beforeEach(() => {
    versioning = new Versioning('/project');
  });

  describe('getCurrentVersion', () => {
    it('should read version from version.json', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: '1.2.3',
        commit: 'abc123',
        timestamp: '2025-01-01T00:00:00Z',
      }));

      const info = versioning.getCurrentVersion();
      expect(info.version).toBe('1.2.3');
    });

    it('should return default version when file is missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const info = versioning.getCurrentVersion();
      expect(info.version).toBeDefined();
    });
  });

  describe('isGitRepo', () => {
    it('should return true when git command succeeds', async () => {
      vi.mocked(child_process.exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, 'true', '');
        return {} as any;
      });

      const result = await versioning.isGitRepo();
      expect(result).toBe(true);
    });

    it('should return false when git command fails', async () => {
      vi.mocked(child_process.exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(new Error('not a git repo'), '', '');
        return {} as any;
      });

      const result = await versioning.isGitRepo();
      expect(result).toBe(false);
    });
  });

  describe('commitChanges', () => {
    it('should commit and return version info', async () => {
      // Mock getCurrentVersion
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: '0.1.0',
        timestamp: '2025-01-01T00:00:00Z',
      }));
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      // Mock git commands (add, commit, rev-parse)
      let callCount = 0;
      vi.mocked(child_process.exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        // Handle both (cmd, callback) and (cmd, opts, callback) signatures
        const cb = typeof _opts === 'function' ? _opts : callback;
        callCount++;
        cb(null, 'abc1234', '');
        return {} as any;
      });

      const result = await versioning.commitChanges('Test change');
      expect(result.success).toBe(true);
    });

    it('should handle commit failures', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: '0.1.0',
        timestamp: '2025-01-01T00:00:00Z',
      }));
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      vi.mocked(child_process.exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(new Error('commit failed'), '', 'error');
        return {} as any;
      });

      const result = await versioning.commitChanges('Test change');
      expect(result.success).toBe(false);
    });
  });

  describe('getRecentCommits', () => {
    it('should return recent commit messages', async () => {
      vi.mocked(child_process.exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, 'commit 1\ncommit 2\ncommit 3', '');
        return {} as any;
      });

      const commits = await versioning.getRecentCommits(3);
      expect(commits).toHaveLength(3);
    });
  });
});
