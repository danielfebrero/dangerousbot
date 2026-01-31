import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Executor } from '../../executor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(__dirname, '../../../.test-executor');

describe('Executor', () => {
  let executor: Executor;

  beforeEach(() => {
    executor = new Executor(TEST_DIR);
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('resolvePath', () => {
    it('should return absolute path as-is', () => {
      const absolute = '/absolute/path/to/file.txt';
      expect(executor.resolvePath(absolute)).toBe(absolute);
    });

    it('should expand home directory', () => {
      const homePath = executor.resolvePath('~/test.txt');
      expect(homePath.startsWith('~')).toBe(false);
      expect(homePath).toContain('test.txt');
    });

    it('should resolve relative paths from project root', () => {
      const relative = executor.resolvePath('relative/path.txt');
      expect(relative).toBe(path.join(TEST_DIR, 'relative/path.txt'));
    });
  });

  describe('executeInMemory', () => {
    it('should execute simple JavaScript code', async () => {
      const result = await executor.executeInMemory('1 + 1');

      expect(result.success).toBe(true);
      expect(result.result).toBe(2);
    });

    it('should capture console.log', async () => {
      const result = await executor.executeInMemory('console.log("Hello"); console.log("World")');

      expect(result.success).toBe(true);
      expect(result.logs).toHaveLength(2);
      expect(result.logs?.[0]).toEqual(['log', 'Hello']);
      expect(result.logs?.[1]).toEqual(['log', 'World']);
    });

    it('should handle console.error and console.warn', async () => {
      const result = await executor.executeInMemory('console.error("Error"); console.warn("Warning")');

      expect(result.success).toBe(true);
      expect(result.logs).toHaveLength(2);
      expect(result.logs?.[0]).toEqual(['error', 'Error']);
      expect(result.logs?.[1]).toEqual(['warn', 'Warning']);
    });

    it('should handle errors in code', async () => {
      const result = await executor.executeInMemory('throw new Error("Test error")');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
    });

    it('should support setTimeout', async () => {
      const code = `let value = 0; setTimeout(() => { value = 42; }, 10); value;`;
      const result = await executor.executeInMemory(code);

      expect(result.success).toBe(true);
    });
  });

  describe('executeFile', () => {
    it('should execute JavaScript file', async () => {
      const result = await executor.executeFile('console.log("From file");', 'test.js');

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('From file');
    });

    it('should handle syntax errors', async () => {
      const result = await executor.executeFile('syntax error {{', 'test.js');

      expect(result.success).toBe(false);
      expect(result.stderr || result.error).toBeTruthy();
    });

    it('should timeout after specified duration', async () => {
      const result = await executor.executeFile('while(true) {}', 'test.js', 'node', { timeout: 1000 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    }, 5000);
  });

  describe('shell', () => {
    it('should execute shell command', async () => {
      const result = await executor.shell('echo "Hello from shell"');

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Hello from shell');
    });

    it('should handle command errors', async () => {
      const result = await executor.shell('exit 1');

      expect(result.success).toBe(false);
    });

    it('should support custom cwd', async () => {
      fs.mkdirSync(path.join(TEST_DIR, 'subdir'), { recursive: true });
      
      const result = await executor.shell('pwd', { cwd: 'subdir' });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('subdir');
    });
  });

  describe('readFile', () => {
    it('should read file content', () => {
      const testFile = path.join(TEST_DIR, 'read-test.txt');
      fs.writeFileSync(testFile, 'Hello World');

      const result = executor.readFile(testFile);

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello World');
    });

    it('should return error for non-existent file', () => {
      const result = executor.readFile('non-existent.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('non trouvé');
    });

    it('should return error for directory', () => {
      const result = executor.readFile('.');

      expect(result.success).toBe(false);
      expect(result.error).toContain('répertoire');
    });

    it('should read file with offset and limit', () => {
      const testFile = path.join(TEST_DIR, 'lines.txt');
      fs.writeFileSync(testFile, 'line1\nline2\nline3\nline4\nline5');

      const result = executor.readFile(testFile, 2, 2);

      expect(result.success).toBe(true);
      expect(result.content).toBe('line2\nline3');
      expect(result.total_lines).toBe(5);
      expect(result.start_line).toBe(2);
      expect(result.end_line).toBe(3);
    });
  });

  describe('readImage', () => {
    it('should read image as base64', () => {
      // Créer un petit fichier PNG valide (1x1 pixel transparent)
      const pngData = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0x60, 0x00, 0x00, 0x00,
        0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82
      ]);
      
      const testImage = path.join(TEST_DIR, 'test.png');
      fs.writeFileSync(testImage, pngData);

      const result = executor.readImage(testImage);

      expect(result.success).toBe(true);
      expect(result.media_type).toBe('image/png');
      expect(result.data).toBeTruthy();
      expect(typeof result.data).toBe('string');
    });

    it('should return error for unsupported image format', () => {
      const testFile = path.join(TEST_DIR, 'test.xyz');
      fs.writeFileSync(testFile, 'content');

      const result = executor.readImage(testFile);

      expect(result.success).toBe(false);
      expect(result.error).toContain('non supporté');
    });
  });

  describe('writeFile', () => {
    it('should write file', () => {
      const result = executor.writeFile('write-test.txt', 'File content');

      expect(result.success).toBe(true);
      expect(fs.readFileSync(path.join(TEST_DIR, 'write-test.txt'), 'utf-8')).toBe('File content');
    });

    it('should create parent directories', () => {
      const result = executor.writeFile('nested/dir/file.txt', 'Nested content');

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(TEST_DIR, 'nested/dir/file.txt'))).toBe(true);
    });
  });

  describe('listFiles', () => {
    it('should list directory contents', () => {
      fs.writeFileSync(path.join(TEST_DIR, 'file1.txt'), '');
      fs.writeFileSync(path.join(TEST_DIR, 'file2.txt'), '');
      fs.mkdirSync(path.join(TEST_DIR, 'subdir'));

      const result = executor.listFiles('.');

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(3);
      const names = result.files?.map(f => f.name).sort();
      expect(names).toEqual(['file1.txt', 'file2.txt', 'subdir']);
    });

    it('should identify file types', () => {
      fs.mkdirSync(path.join(TEST_DIR, 'mydir'));
      fs.writeFileSync(path.join(TEST_DIR, 'myfile.txt'), '');

      const result = executor.listFiles('.');

      const dir = result.files?.find(f => f.name === 'mydir');
      const file = result.files?.find(f => f.name === 'myfile.txt');

      expect(dir?.type).toBe('directory');
      expect(file?.type).toBe('file');
    });
  });

  describe('editFile', () => {
    it('should replace string in file', () => {
      const testFile = path.join(TEST_DIR, 'edit.txt');
      fs.writeFileSync(testFile, 'Hello World');

      const result = executor.editFile(testFile, 'World', 'Universe');

      expect(result.success).toBe(true);
      expect(result.replacements).toBe(1);
      expect(fs.readFileSync(testFile, 'utf-8')).toBe('Hello Universe');
    });

    it('should replace all occurrences with replaceAll', () => {
      const testFile = path.join(TEST_DIR, 'edit-all.txt');
      fs.writeFileSync(testFile, 'cat cat cat');

      const result = executor.editFile(testFile, 'cat', 'dog', true);

      expect(result.success).toBe(true);
      expect(result.replacements).toBe(3);
      expect(fs.readFileSync(testFile, 'utf-8')).toBe('dog dog dog');
    });

    it('should return error if string not found', () => {
      const testFile = path.join(TEST_DIR, 'edit-fail.txt');
      fs.writeFileSync(testFile, 'content');

      const result = executor.editFile(testFile, 'nonexistent', 'replacement');

      expect(result.success).toBe(false);
      expect(result.error).toContain('non trouvée');
    });
  });

  describe('deleteFile', () => {
    it('should delete existing file', () => {
      const testFile = path.join(TEST_DIR, 'delete-me.txt');
      fs.writeFileSync(testFile, 'delete this');

      const result = executor.deleteFile(testFile);

      expect(result.success).toBe(true);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should return error for non-existent file', () => {
      const result = executor.deleteFile('non-existent.txt');

      expect(result.success).toBe(false);
    });
  });

  describe('mkdir', () => {
    it('should create directory', () => {
      const result = executor.mkdir('new-dir');

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(TEST_DIR, 'new-dir'))).toBe(true);
    });

    it('should handle existing directory', () => {
      fs.mkdirSync(path.join(TEST_DIR, 'existing-dir'));

      const result = executor.mkdir('existing-dir');

      expect(result.success).toBe(true);
    });

    it('should create nested directories', () => {
      const result = executor.mkdir('a/b/c');

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(TEST_DIR, 'a/b/c'))).toBe(true);
    });
  });

  describe('exists', () => {
    it('should return true for existing file', () => {
      fs.writeFileSync(path.join(TEST_DIR, 'exists.txt'), '');

      expect(executor.exists('exists.txt')).toBe(true);
    });

    it('should return false for non-existent file', () => {
      expect(executor.exists('nonexistent.txt')).toBe(false);
    });
  });

  describe('projectRoot', () => {
    it('should get project root', () => {
      expect(executor.getProjectRoot()).toBe(TEST_DIR);
    });

    it('should set project root', () => {
      const newRoot = '/new/root';
      executor.setProjectRoot(newRoot);
      expect(executor.getProjectRoot()).toBe(newRoot);
    });
  });
});
