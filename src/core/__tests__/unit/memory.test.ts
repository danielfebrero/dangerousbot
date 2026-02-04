/**
 * Unit tests for Memory
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database
const mockDb = {
  prepare: vi.fn().mockReturnThis(),
  run: vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
  get: vi.fn(),
  all: vi.fn().mockReturnValue([]),
};

vi.mock('../../../database/index.js', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { Memory } from '../../memory.js';

describe('Memory', () => {
  let memory: Memory;

  beforeEach(() => {
    // Reset all mocks
    mockDb.prepare.mockReturnThis();
    mockDb.run.mockReturnValue({ lastInsertRowid: 1, changes: 1 });
    mockDb.get.mockReturnValue(undefined);
    mockDb.all.mockReturnValue([]);

    memory = new Memory();
  });

  describe('getSessionId', () => {
    it('should return a session ID', () => {
      const sid = memory.getSessionId();
      expect(sid).toBeDefined();
      expect(typeof sid).toBe('string');
    });
  });

  describe('setSessionId', () => {
    it('should update session ID', () => {
      memory.setSessionId('test-session');
      expect(memory.getSessionId()).toBe('test-session');
    });
  });

  describe('resumeLastSession', () => {
    it('should return true if last session exists', () => {
      mockDb.get.mockReturnValue({ session_id: 'prev-session' });
      const result = memory.resumeLastSession();
      expect(result).toBe(true);
      expect(memory.getSessionId()).toBe('prev-session');
    });

    it('should return false if no previous session', () => {
      mockDb.get.mockReturnValue(undefined);
      const result = memory.resumeLastSession();
      expect(result).toBe(false);
    });
  });

  describe('addMessage', () => {
    it('should insert a message and return ID', () => {
      // No duplicate found
      mockDb.get
        .mockReturnValueOnce(undefined) // recentDuplicate check
        .mockReturnValue({ id: 'thread_main_1' }); // mainThread check

      mockDb.run.mockReturnValue({ lastInsertRowid: 42 });

      const id = memory.addMessage('user', 'Hello world');
      expect(id).toBe(42);
    });

    it('should skip duplicate messages', () => {
      mockDb.get.mockReturnValue({ id: 99 }); // recentDuplicate found

      const id = memory.addMessage('user', 'Hello world');
      expect(id).toBe(99);
    });

    it('should use specified threadId', () => {
      // No duplicate
      mockDb.get
        .mockReturnValueOnce(undefined) // recentDuplicate
        .mockReturnValueOnce({ id: 'thread-abc' }); // existing thread

      mockDb.run.mockReturnValue({ lastInsertRowid: 10 });

      const id = memory.addMessage('user', 'Hello', undefined, undefined, undefined, 'thread-abc');
      expect(id).toBe(10);
    });
  });

  describe('getMessages', () => {
    it('should return parsed messages in chronological order', () => {
      mockDb.all.mockReturnValue([
        { id: 2, session_id: 's1', role: 'assistant', content: 'Hi', tool_calls: null, images: null, source: null, timestamp: '2025-01-01T00:00:01Z' },
        { id: 1, session_id: 's1', role: 'user', content: 'Hello', tool_calls: null, images: null, source: null, timestamp: '2025-01-01T00:00:00Z' },
      ]);

      const messages = memory.getMessages();
      expect(messages).toHaveLength(2);
      // Rows come DESC [id:2, id:1], reversed -> [id:1 user, id:2 assistant]
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    it('should parse tool_calls JSON', () => {
      mockDb.all.mockReturnValue([
        { id: 1, role: 'assistant', content: 'text', tool_calls: '[{"name":"read_file"}]', images: null, source: null, timestamp: '2025-01-01' },
      ]);

      const messages = memory.getMessages();
      expect(messages[0].tool_calls).toEqual([{ name: 'read_file' }]);
    });
  });

  describe('addKnowledge', () => {
    it('should insert knowledge and return ID', () => {
      mockDb.run.mockReturnValue({ lastInsertRowid: 5 });
      const id = memory.addKnowledge('fact', 'The sky is blue');
      expect(id).toBe(5);
    });
  });

  describe('getKnowledge', () => {
    it('should return all knowledge when no type specified', () => {
      mockDb.all.mockReturnValue([
        { id: 1, type: 'fact', content: 'Fact 1', created_at: '2025-01-01' },
      ]);

      const knowledge = memory.getKnowledge();
      expect(knowledge).toHaveLength(1);
    });

    it('should filter by type when specified', () => {
      mockDb.all.mockReturnValue([]);
      memory.getKnowledge('preference');
      expect(mockDb.prepare).toHaveBeenCalled();
    });
  });

  describe('setConfig / getConfig', () => {
    it('should store and retrieve config', () => {
      memory.setConfig('key1', 'value1');
      expect(mockDb.run).toHaveBeenCalled();
    });

    it('should return null for missing config', () => {
      mockDb.get.mockReturnValue(undefined);
      const value = memory.getConfig('nonexistent');
      expect(value).toBeNull();
    });

    it('should return value for existing config', () => {
      mockDb.get.mockReturnValue({ value: 'test-value' });
      const value = memory.getConfig('key1');
      expect(value).toBe('test-value');
    });
  });

  describe('updateMessageEmbedding', () => {
    it('should update embedding as buffer', () => {
      memory.updateMessageEmbedding(1, [0.1, 0.2, 0.3]);
      expect(mockDb.run).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return session, message, and knowledge counts', () => {
      mockDb.get
        .mockReturnValueOnce({ count: 3 })  // sessions
        .mockReturnValueOnce({ count: 100 }) // messages
        .mockReturnValueOnce({ count: 5 });  // knowledge

      const stats = memory.getStats();
      expect(stats.sessions).toBe(3);
      expect(stats.messages).toBe(100);
      expect(stats.knowledge).toBe(5);
    });
  });

  describe('clearSession', () => {
    it('should delete messages for current session', () => {
      memory.clearSession();
      expect(mockDb.run).toHaveBeenCalled();
    });
  });

  describe('telegram', () => {
    it('should set and get telegram active thread', () => {
      memory.setTelegramActiveThread(12345, 'thread-1');
      expect(mockDb.run).toHaveBeenCalled();
    });

    it('should set and get telegram master', () => {
      mockDb.get.mockReturnValue({ user_id: 12345, username: 'test' });
      const master = memory.getTelegramMaster();
      expect(master).toEqual({ user_id: 12345, username: 'test' });
    });
  });

  describe('code embeddings', () => {
    it('should add code embedding', () => {
      mockDb.run.mockReturnValue({ lastInsertRowid: 7 });
      const id = memory.addCodeEmbedding('/src/test.ts', 'content', 'hash123', [0.1, 0.2], 50, 200);
      expect(id).toBe(7);
    });

    it('should return null for missing code embedding', () => {
      mockDb.get.mockReturnValue(undefined);
      const result = memory.getCodeEmbedding('/nonexistent.ts');
      expect(result).toBeNull();
    });

    it('should list indexed projects', () => {
      mockDb.all.mockReturnValue([{ project_name: 'dangerousbot' }]);
      const projects = memory.listIndexedProjects();
      expect(projects).toEqual(['dangerousbot']);
    });
  });

  describe('webapp settings', () => {
    it('should return default settings', () => {
      mockDb.get.mockReturnValue(undefined);
      const settings = memory.getWebappSettings();
      expect(settings.showAllSources).toBe(false);
    });

    it('should save settings', () => {
      memory.setWebappSettings({ showAllSources: true });
      expect(mockDb.run).toHaveBeenCalled();
    });
  });
});
