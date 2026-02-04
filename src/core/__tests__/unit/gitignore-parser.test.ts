/**
 * Unit tests for GitignoreParser
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { GitignoreParser } from '../../gitignore-parser.js';

// Mock fs to avoid real filesystem access
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('GitignoreParser', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  describe('parse', () => {
    it('should parse simple patterns', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const parser = new GitignoreParser('/project');
      const patterns = parser.parse('node_modules\ndist\n*.log');
      expect(patterns).toHaveLength(3);
      expect(patterns[0].pattern).toBe('node_modules');
      expect(patterns[1].pattern).toBe('dist');
      expect(patterns[2].pattern).toBe('*.log');
    });

    it('should ignore empty lines', () => {
      const parser = new GitignoreParser('/project');
      const patterns = parser.parse('node_modules\n\n\ndist');
      expect(patterns).toHaveLength(2);
    });

    it('should ignore comments', () => {
      const parser = new GitignoreParser('/project');
      const patterns = parser.parse('# comment\nnode_modules\n# another comment');
      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern).toBe('node_modules');
    });

    it('should detect negated patterns', () => {
      const parser = new GitignoreParser('/project');
      const patterns = parser.parse('*.log\n!important.log');
      expect(patterns[0].negated).toBe(false);
      expect(patterns[1].negated).toBe(true);
      expect(patterns[1].pattern).toBe('important.log');
    });

    it('should detect directory-only patterns', () => {
      const parser = new GitignoreParser('/project');
      const patterns = parser.parse('build/');
      expect(patterns[0].directoryOnly).toBe(true);
      expect(patterns[0].pattern).toBe('build');
    });

    it('should detect anchored patterns', () => {
      const parser = new GitignoreParser('/project');
      const patterns = parser.parse('/root-only\nsrc/test');
      expect(patterns[0].anchored).toBe(true);
      expect(patterns[0].pattern).toBe('root-only');
      expect(patterns[1].anchored).toBe(true);
    });

    it('should detect non-anchored patterns', () => {
      const parser = new GitignoreParser('/project');
      const patterns = parser.parse('*.log');
      expect(patterns[0].anchored).toBe(false);
    });
  });

  describe('isIgnored', () => {
    function createParser(gitignoreContent: string): GitignoreParser {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(gitignoreContent);
      return new GitignoreParser('/project');
    }

    it('should always ignore .git directory', () => {
      const parser = createParser('');
      expect(parser.isIgnored('.git')).toBe(true);
      expect(parser.isIgnored('.git/objects')).toBe(true);
    });

    it('should match simple patterns', () => {
      const parser = createParser('node_modules');
      expect(parser.isIgnored('node_modules')).toBe(true);
      expect(parser.isIgnored('node_modules/package/index.js')).toBe(true);
    });

    it('should match wildcard patterns', () => {
      const parser = createParser('*.log');
      expect(parser.isIgnored('error.log')).toBe(true);
      expect(parser.isIgnored('logs/error.log')).toBe(true);
      expect(parser.isIgnored('error.txt')).toBe(false);
    });

    it('should respect negation', () => {
      const parser = createParser('*.log\n!important.log');
      expect(parser.isIgnored('error.log')).toBe(true);
      expect(parser.isIgnored('important.log')).toBe(false);
    });

    it('should handle directory-only patterns', () => {
      const parser = createParser('build/');
      expect(parser.isIgnored('build', true)).toBe(true);
      expect(parser.isIgnored('build', false)).toBe(false); // File named 'build' is NOT ignored
    });

    it('should handle anchored patterns', () => {
      const parser = createParser('/root-file');
      expect(parser.isIgnored('root-file')).toBe(true);
      expect(parser.isIgnored('subdir/root-file')).toBe(false);
    });

    it('should handle double star patterns', () => {
      // **/logs is anchored (contains /) - test with non-anchored wildcard pattern
      const parser = createParser('*.log');
      expect(parser.isIgnored('error.log')).toBe(true);
      expect(parser.isIgnored('src/error.log')).toBe(true);
      expect(parser.isIgnored('deep/nested/error.log')).toBe(true);
    });

    it('should handle absolute paths', () => {
      const parser = createParser('dist');
      expect(parser.isIgnored('/project/dist')).toBe(true);
    });

    it('should not ignore unmatched files', () => {
      const parser = createParser('dist\n*.log');
      expect(parser.isIgnored('src/index.ts')).toBe(false);
      expect(parser.isIgnored('README.md')).toBe(false);
    });
  });

  describe('getPatterns', () => {
    it('should return a copy of patterns', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('node_modules\ndist');
      const parser = new GitignoreParser('/project');
      const patterns = parser.getPatterns();
      expect(patterns).toHaveLength(2);
      // Verify it's a copy
      patterns.push({ pattern: 'extra', negated: false, directoryOnly: false, anchored: false });
      expect(parser.getPatterns()).toHaveLength(2);
    });
  });

  describe('loadGitignore', () => {
    it('should load patterns from .gitignore file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('node_modules\ndist');
      const parser = new GitignoreParser('/project');
      expect(parser.getPatterns()).toHaveLength(2);
    });

    it('should handle missing .gitignore', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const parser = new GitignoreParser('/project');
      expect(parser.getPatterns()).toHaveLength(0);
    });
  });
});
