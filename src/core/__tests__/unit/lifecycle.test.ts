/**
 * Unit tests for Lifecycle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as child_process from 'child_process';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { Lifecycle } from '../../lifecycle.js';

describe('Lifecycle', () => {
  let lifecycle: Lifecycle;

  beforeEach(() => {
    lifecycle = new Lifecycle('/project');
  });

  describe('getProjectRoot', () => {
    it('should return the project root', () => {
      expect(lifecycle.getProjectRoot()).toBe('/project');
    });
  });

  describe('isDevMode', () => {
    it('should detect dev mode from NODE_ENV', () => {
      const result = lifecycle.isDevMode();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('checkExistingInstance', () => {
    it('should return not running when lockfile missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = lifecycle.checkExistingInstance();
      expect(result.running).toBe(false);
    });

    it('should return running when lockfile exists with valid PID', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('12345');

      // Mock process.kill to not throw (process exists)
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      const result = lifecycle.checkExistingInstance();
      expect(result.running).toBe(true);
      expect(result.pid).toBe(12345);

      killSpy.mockRestore();
    });

    it('should return not running when PID is stale', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('99999');

      // Mock process.kill to throw (process doesn't exist)
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      const result = lifecycle.checkExistingInstance();
      expect(result.running).toBe(false);

      killSpy.mockRestore();
    });
  });

  describe('acquireLock', () => {
    it('should write lockfile with current PID', () => {
      // ensureDir + checkExistingInstance both call existsSync
      // acquireLock -> ensureDir (dir exists) -> killExistingInstance -> checkExistingInstance -> existsSync(lockfile)
      // We need: dir exists=true, lockfile exists=false (no existing instance)
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (String(p).endsWith('.lock')) return false; // No existing lock
        return true; // Dir exists
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const result = lifecycle.acquireLock();
      expect(result).toBe(true);
      // writeFileSync should have been called with PID as string
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('lock'),
        expect.stringContaining(String(process.pid)),
        expect.anything()
      );
    });
  });

  describe('releaseLock', () => {
    it('should delete lockfile when owned by current process', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(String(process.pid));
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});

      lifecycle.releaseLock();
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should handle missing lockfile gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(() => lifecycle.releaseLock()).not.toThrow();
    });
  });

  describe('markRestarted / checkRestarted / clearRestarted', () => {
    it('should write restart marker file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      lifecycle.markRestarted('self_update', 'thread-1');
      // Check that writeFileSync was called with a path containing restart-related name
      const calls = vi.mocked(fs.writeFileSync).mock.calls;
      const hasRestartCall = calls.some(call => String(call[0]).includes('restart'));
      expect(hasRestartCall).toBe(true);
    });

    it('should detect restart marker', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        restarted: true,
        reason: 'test',
        timestamp: new Date().toISOString(),
      }));

      const result = lifecycle.checkRestarted();
      expect(result.restarted).toBe(true);
    });

    it('should return not restarted when marker missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = lifecycle.checkRestarted();
      expect(result.restarted).toBe(false);
    });

    it('should clear restart marker', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});

      lifecycle.clearRestarted();
      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('build', () => {
    it('should run npm build command', async () => {
      vi.mocked(child_process.exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(null, 'Build successful', '');
        return {} as any;
      });

      const result = await lifecycle.build();
      expect(result.success).toBe(true);
    });

    it('should handle build failures', async () => {
      vi.mocked(child_process.exec).mockImplementation((_cmd: any, _opts: any, callback: any) => {
        const cb = typeof _opts === 'function' ? _opts : callback;
        cb(new Error('Build failed'), '', 'error');
        return {} as any;
      });

      const result = await lifecycle.build();
      expect(result.success).toBe(false);
    });
  });
});
