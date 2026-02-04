/**
 * Unit tests for Executor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn().mockReturnValue({ isDirectory: () => false, size: 100 }),
  lstatSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

import { Executor } from '../../executor.js';

describe('Executor', () => {
  let executor: Executor;

  beforeEach(() => {
    executor = new Executor('/project');
  });

  describe('constructor', () => {
    it('should set project root', () => {
      expect(executor.getProjectRoot()).toBe('/project');
    });

    it('should default to cwd if not provided', () => {
      const ex = new Executor();
      expect(ex.getProjectRoot()).toBe(process.cwd());
    });
  });

  describe('resolvePath', () => {
    it('should resolve relative paths against project root', () => {
      const resolved = executor.resolvePath('src/index.ts');
      expect(resolved).toBe(path.join('/project', 'src/index.ts'));
    });

    it('should keep absolute paths as-is', () => {
      const resolved = executor.resolvePath('/absolute/path.ts');
      expect(resolved).toBe('/absolute/path.ts');
    });

    it('should resolve home directory (~)', () => {
      const resolved = executor.resolvePath('~/file.txt');
      expect(resolved).toContain('file.txt');
      expect(resolved).not.toContain('~');
    });
  });

  describe('setProjectRoot', () => {
    it('should update project root', () => {
      executor.setProjectRoot('/new/root');
      expect(executor.getProjectRoot()).toBe('/new/root');
    });
  });

  describe('readFile', () => {
    it('should return file content', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false, size: 100 } as any);
      vi.mocked(fs.readFileSync).mockReturnValue('line1\nline2\nline3');

      const result = executor.readFile('test.txt');
      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    it('should fail for non-existent file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = executor.readFile('nonexistent.txt');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should support offset and limit', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false, size: 100 } as any);
      vi.mocked(fs.readFileSync).mockReturnValue('line1\nline2\nline3\nline4\nline5');

      const result = executor.readFile('test.txt', 2, 2);
      expect(result.success).toBe(true);
    });
  });

  describe('writeFile', () => {
    it('should write file content', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const result = executor.writeFile('output.txt', 'hello world');
      expect(result.success).toBe(true);
    });

    it('should create parent directory if needed', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => '');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const result = executor.writeFile('new/dir/file.txt', 'content');
      expect(result.success).toBe(true);
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it('should return true for existing file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      expect(executor.exists('test.txt')).toBe(true);
    });

    it('should return false for non-existing file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(executor.exists('nope.txt')).toBe(false);
    });
  });

  describe('deleteFile', () => {
    it('should delete existing file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.lstatSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});

      const result = executor.deleteFile('to-delete.txt');
      expect(result.success).toBe(true);
    });

    it('should fail for non-existent file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = executor.deleteFile('nonexistent.txt');
      expect(result.success).toBe(false);
    });
  });

  describe('editFile', () => {
    it('should replace text in file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('hello world');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const result = executor.editFile('test.txt', 'hello', 'goodbye');
      expect(result.success).toBe(true);
      expect(result.replacements).toBe(1);
    });

    it('should fail if old string not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('hello world');

      const result = executor.editFile('test.txt', 'nonexistent', 'replacement');
      expect(result.success).toBe(false);
    });

    it('should replace all occurrences with replaceAll flag', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('aaa');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const result = executor.editFile('test.txt', 'a', 'b', true);
      expect(result.success).toBe(true);
    });
  });

  describe('listFiles', () => {
    it('should list directory contents', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true } as any,
        { name: 'subdir', isDirectory: () => true, isFile: () => false } as any,
      ]);

      const result = executor.listFiles('.');
      expect(result.success).toBe(true);
      expect(result.files).toBeDefined();
    });

    it('should fail for non-existent directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = executor.listFiles('nonexistent');
      expect(result.success).toBe(false);
    });
  });

  describe('executeInMemory', () => {
    it('should execute simple code', async () => {
      const result = await executor.executeInMemory('const x = 1 + 2; x;');
      expect(result.success).toBe(true);
    });

    it('should capture logs', async () => {
      const result = await executor.executeInMemory('console.log("hello")');
      expect(result.success).toBe(true);
      expect(result.logs).toBeDefined();
    });

    it('should handle execution errors', async () => {
      const result = await executor.executeInMemory('throw new Error("test error")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('test error');
    });
  });
});
