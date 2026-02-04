import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

const { mockThreadManager, mockMemory } = vi.hoisted(() => ({
  mockThreadManager: {
    listThreads: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockReturnValue({ totalThreads: 0, totalMessages: 0 }),
    getThread: vi.fn(),
    getThreadMessages: vi.fn().mockReturnValue([]),
    getSubThreads: vi.fn().mockReturnValue([]),
    createThread: vi.fn().mockReturnValue('thread-new'),
    createSubThread: vi.fn().mockReturnValue('sub-thread-1'),
    renameThread: vi.fn(),
    deleteThread: vi.fn(),
    clearThreadMessages: vi.fn(),
  },
  mockMemory: {
    setTelegramActiveThread: vi.fn(),
  },
}));

vi.mock('../../../thread-manager.js', () => ({
  getThreadManager: vi.fn(() => mockThreadManager),
}));
vi.mock('../../../memory.js', () => ({
  getMemory: vi.fn(() => mockMemory),
}));

import { manageThreadsHandler, manageThreadsDefinition } from '../../manage-threads.js';

const makeThread = (overrides: Record<string, any> = {}) => ({
  id: 'thread-1',
  title: 'Test Thread',
  isMain: false,
  parentThreadId: 'parent-1',
  source: 'webapp',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  ...overrides,
});

describe('manage_threads tool', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockThreadManager.listThreads.mockReturnValue([]);
    mockThreadManager.getStats.mockReturnValue({ totalThreads: 0, totalMessages: 0 });
    mockThreadManager.getThread.mockReturnValue(undefined);
    mockThreadManager.getThreadMessages.mockReturnValue([]);
    mockThreadManager.getSubThreads.mockReturnValue([]);
    mockThreadManager.createThread.mockReturnValue('thread-new');
    mockThreadManager.createSubThread.mockReturnValue('sub-thread-1');
    mockThreadManager.renameThread.mockReturnValue(false);
    mockThreadManager.deleteThread.mockReturnValue(false);
    ctx = createMockToolContext();
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(manageThreadsHandler.name).toBe('manage_threads');
    });

    it('should expose the definition', () => {
      expect(manageThreadsHandler.definition).toBe(manageThreadsDefinition);
    });

    it('should require the action property', () => {
      expect(manageThreadsDefinition.input_schema.required).toContain('action');
    });

    it('should enumerate valid actions', () => {
      const actionProp = manageThreadsDefinition.input_schema.properties.action as any;
      expect(actionProp.enum).toEqual([
        'list', 'get', 'create', 'create_sub', 'switch', 'exit', 'rename', 'delete', 'clear',
      ]);
    });
  });

  describe('list action', () => {
    it('should return threads and stats', async () => {
      const thread1 = makeThread({ id: 'thread-1', title: 'Thread One', isMain: true, parentThreadId: null });
      const thread2 = makeThread({ id: 'thread-2', title: 'Thread Two' });
      mockThreadManager.listThreads.mockReturnValue([thread1, thread2]);
      mockThreadManager.getStats.mockReturnValue({ totalThreads: 2, totalMessages: 10 });

      const result = await manageThreadsHandler.execute({ action: 'list' }, ctx);

      expect(result.success).toBe(true);
      expect(mockThreadManager.listThreads).toHaveBeenCalled();
      expect(mockThreadManager.getStats).toHaveBeenCalled();
      expect(result.threads).toHaveLength(2);
      expect(result.threads[0]).toEqual({
        id: 'thread-1',
        title: 'Thread One',
        is_main: true,
        parent_thread_id: null,
        source: 'webapp',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      });
      expect(result.stats).toEqual({
        total_threads: 2,
        total_messages: 10,
      });
    });
  });

  describe('get action', () => {
    it('should return thread with messages and sub-threads', async () => {
      const thread = makeThread();
      mockThreadManager.getThread.mockReturnValue(thread);
      mockThreadManager.getThreadMessages.mockReturnValue([
        { id: 'msg-1', role: 'user', content: 'hello', timestamp: '2024-01-01T00:00:00Z', images: [], toolCalls: [] },
        { id: 'msg-2', role: 'assistant', content: 'hi', timestamp: '2024-01-01T00:01:00Z', images: ['img.png'], toolCalls: [{ name: 'test' }] },
      ]);
      mockThreadManager.getSubThreads.mockReturnValue([
        { id: 'sub-1', title: 'Sub Thread 1', createdAt: '2024-01-02' },
      ]);

      const result = await manageThreadsHandler.execute({ action: 'get', thread_id: 'thread-1' }, ctx);

      expect(result.success).toBe(true);
      expect(mockThreadManager.getThread).toHaveBeenCalledWith('thread-1');
      expect(mockThreadManager.getThreadMessages).toHaveBeenCalledWith('thread-1');
      expect(mockThreadManager.getSubThreads).toHaveBeenCalledWith('thread-1');
      expect(result.thread).toEqual({
        id: 'thread-1',
        title: 'Test Thread',
        is_main: false,
        parent_thread_id: 'parent-1',
        source: 'webapp',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      });
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].has_images).toBe(false);
      expect(result.messages[0].has_tool_calls).toBe(false);
      expect(result.messages[1].has_images).toBe(true);
      expect(result.messages[1].has_tool_calls).toBe(true);
      expect(result.sub_threads).toHaveLength(1);
      expect(result.sub_threads[0]).toEqual({
        id: 'sub-1',
        title: 'Sub Thread 1',
        created_at: '2024-01-02',
      });
      expect(result.message_count).toBe(2);
    });

    it('should return error if thread not found', async () => {
      mockThreadManager.getThread.mockReturnValue(null);

      const result = await manageThreadsHandler.execute({ action: 'get', thread_id: 'nonexistent' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
      expect(result.error).toContain('non trouv');
    });

    it('should return error if no thread_id provided', async () => {
      const result = await manageThreadsHandler.execute({ action: 'get' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('thread_id');
      expect(result.error).toContain('requis');
    });
  });

  describe('create action', () => {
    it('should create thread with given title', async () => {
      const createdThread = makeThread({ id: 'thread-new', title: 'My Thread' });
      mockThreadManager.createThread.mockReturnValue('thread-new');
      mockThreadManager.getThread.mockReturnValue(createdThread);

      const result = await manageThreadsHandler.execute({ action: 'create', title: 'My Thread' }, ctx);

      expect(result.success).toBe(true);
      expect(mockThreadManager.createThread).toHaveBeenCalledWith('My Thread', null, false, 'webapp');
      expect(result.thread.id).toBe('thread-new');
      expect(result.thread.title).toBe('My Thread');
      expect(result.message).toContain('My Thread');
    });

    it('should use default title "New Thread" when none provided', async () => {
      const createdThread = makeThread({ id: 'thread-new', title: 'New Thread' });
      mockThreadManager.createThread.mockReturnValue('thread-new');
      mockThreadManager.getThread.mockReturnValue(createdThread);

      const result = await manageThreadsHandler.execute({ action: 'create' }, ctx);

      expect(result.success).toBe(true);
      expect(mockThreadManager.createThread).toHaveBeenCalledWith('New Thread', null, false, 'webapp');
      expect(result.thread.title).toBe('New Thread');
    });
  });

  describe('create_sub action', () => {
    it('should create sub-thread under parent', async () => {
      const parentThread = makeThread({ id: 'parent-1', title: 'Parent Thread' });
      const subThread = makeThread({ id: 'sub-thread-1', title: 'Sub Topic', parentThreadId: 'parent-1' });

      mockThreadManager.getThread
        .mockReturnValueOnce(parentThread)   // for parent check
        .mockReturnValueOnce(subThread);     // for created sub-thread
      mockThreadManager.createSubThread.mockReturnValue('sub-thread-1');

      const result = await manageThreadsHandler.execute(
        { action: 'create_sub', parent_thread_id: 'parent-1', title: 'Sub Topic' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(mockThreadManager.createSubThread).toHaveBeenCalledWith('parent-1', 'Sub Topic');
      expect(result.thread.id).toBe('sub-thread-1');
      expect(result.thread.parent_thread_id).toBe('parent-1');
      expect(result.message).toContain('Sub Topic');
      expect(result.message).toContain('Parent Thread');
    });

    it('should return error if parent_thread_id is missing', async () => {
      const result = await manageThreadsHandler.execute({ action: 'create_sub', title: 'Sub' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('parent_thread_id');
      expect(result.error).toContain('requis');
    });

    it('should return error if parent thread not found', async () => {
      mockThreadManager.getThread.mockReturnValue(null);

      const result = await manageThreadsHandler.execute(
        { action: 'create_sub', parent_thread_id: 'nonexistent', title: 'Sub' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
      expect(result.error).toContain('non trouv');
    });
  });

  describe('switch action', () => {
    it('should return thread info on successful switch', async () => {
      const thread = makeThread({ id: 'thread-1', title: 'Target Thread' });
      mockThreadManager.getThread.mockReturnValue(thread);
      mockThreadManager.getThreadMessages.mockReturnValue([{ id: 'msg-1' }, { id: 'msg-2' }]);

      const result = await manageThreadsHandler.execute({ action: 'switch', thread_id: 'thread-1' }, ctx);

      expect(result.success).toBe(true);
      expect(result.thread.id).toBe('thread-1');
      expect(result.thread.title).toBe('Target Thread');
      expect(result.thread.message_count).toBe(2);
      expect(result.message).toContain('Target Thread');
    });

    it('should return error if thread not found', async () => {
      mockThreadManager.getThread.mockReturnValue(null);

      const result = await manageThreadsHandler.execute({ action: 'switch', thread_id: 'nonexistent' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
      expect(result.error).toContain('non trouv');
    });

    it('should return error if no thread_id provided', async () => {
      const result = await manageThreadsHandler.execute({ action: 'switch' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('thread_id');
      expect(result.error).toContain('requis');
    });

    it('should persist thread for telegram source', async () => {
      const thread = makeThread({ id: 'thread-1', title: 'TG Thread' });
      mockThreadManager.getThread.mockReturnValue(thread);
      mockThreadManager.getThreadMessages.mockReturnValue([]);
      ctx = createMockToolContext({ source: 'telegram', telegramUserId: 12345 } as any);

      const result = await manageThreadsHandler.execute({ action: 'switch', thread_id: 'thread-1' }, ctx);

      expect(result.success).toBe(true);
      expect(mockMemory.setTelegramActiveThread).toHaveBeenCalledWith(12345, 'thread-1');
    });
  });

  describe('exit action', () => {
    it('should find parent thread and return it', async () => {
      const currentThread = makeThread({ id: 'thread-1', title: 'Sub Thread', parentThreadId: 'parent-1' });
      const parentThread = makeThread({ id: 'parent-1', title: 'Parent Thread', parentThreadId: null, isMain: true });

      mockThreadManager.getThread
        .mockReturnValueOnce(currentThread)   // for current thread
        .mockReturnValueOnce(parentThread);   // for parent thread
      mockThreadManager.getThreadMessages.mockReturnValue([{ id: 'msg-1' }]);

      const result = await manageThreadsHandler.execute({ action: 'exit', thread_id: 'thread-1' }, ctx);

      expect(result.success).toBe(true);
      expect(result.previous_thread.id).toBe('thread-1');
      expect(result.previous_thread.title).toBe('Sub Thread');
      expect(result.thread.id).toBe('parent-1');
      expect(result.thread.title).toBe('Parent Thread');
      expect(result.message).toContain('Parent Thread');
    });

    it('should return error if no thread_id provided', async () => {
      const result = await manageThreadsHandler.execute({ action: 'exit' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('thread_id');
      expect(result.error).toContain('requis');
    });

    it('should return error if thread not found', async () => {
      mockThreadManager.getThread.mockReturnValue(null);

      const result = await manageThreadsHandler.execute({ action: 'exit', thread_id: 'nonexistent' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
      expect(result.error).toContain('non trouv');
    });

    it('should return error if no parent thread (main thread)', async () => {
      const mainThread = makeThread({ id: 'thread-main', title: 'Main', parentThreadId: null, isMain: true });
      mockThreadManager.getThread.mockReturnValue(mainThread);

      const result = await manageThreadsHandler.execute({ action: 'exit', thread_id: 'thread-main' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('pas de thread parent');
    });

    it('should persist parent thread for telegram source', async () => {
      const currentThread = makeThread({ id: 'thread-1', title: 'Sub', parentThreadId: 'parent-1' });
      const parentThread = makeThread({ id: 'parent-1', title: 'Parent', parentThreadId: null });

      mockThreadManager.getThread
        .mockReturnValueOnce(currentThread)
        .mockReturnValueOnce(parentThread);
      mockThreadManager.getThreadMessages.mockReturnValue([]);
      ctx = createMockToolContext({ source: 'telegram', telegramUserId: 12345 } as any);

      const result = await manageThreadsHandler.execute({ action: 'exit', thread_id: 'thread-1' }, ctx);

      expect(result.success).toBe(true);
      expect(mockMemory.setTelegramActiveThread).toHaveBeenCalledWith(12345, 'parent-1');
    });
  });

  describe('rename action', () => {
    it('should rename thread and return success', async () => {
      mockThreadManager.renameThread.mockReturnValue(true);

      const result = await manageThreadsHandler.execute(
        { action: 'rename', thread_id: 'thread-1', title: 'New Title' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(mockThreadManager.renameThread).toHaveBeenCalledWith('thread-1', 'New Title');
      expect(result.message).toContain('New Title');
    });

    it('should return error if thread not found (returns false)', async () => {
      mockThreadManager.renameThread.mockReturnValue(false);

      const result = await manageThreadsHandler.execute(
        { action: 'rename', thread_id: 'nonexistent', title: 'New Title' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
      expect(result.error).toContain('non trouv');
    });

    it('should return error if thread_id or title is missing', async () => {
      const result = await manageThreadsHandler.execute({ action: 'rename', thread_id: 'thread-1' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('thread_id');
      expect(result.error).toContain('title');
      expect(result.error).toContain('requis');
    });
  });

  describe('delete action', () => {
    it('should delete thread and return success', async () => {
      const thread = makeThread({ id: 'thread-1', title: 'Doomed Thread' });
      mockThreadManager.getThread.mockReturnValue(thread);
      mockThreadManager.deleteThread.mockReturnValue(true);

      const result = await manageThreadsHandler.execute({ action: 'delete', thread_id: 'thread-1' }, ctx);

      expect(result.success).toBe(true);
      expect(mockThreadManager.deleteThread).toHaveBeenCalledWith('thread-1');
      expect(result.message).toContain('Doomed Thread');
      expect(result.message).toContain('supprim');
    });

    it('should return error if thread not found', async () => {
      mockThreadManager.getThread.mockReturnValue(null);

      const result = await manageThreadsHandler.execute({ action: 'delete', thread_id: 'nonexistent' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
      expect(result.error).toContain('non trouv');
    });

    it('should return error if no thread_id provided', async () => {
      const result = await manageThreadsHandler.execute({ action: 'delete' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('thread_id');
      expect(result.error).toContain('requis');
    });

    it('should return error if deleteThread returns false', async () => {
      const thread = makeThread({ id: 'thread-1', title: 'Stubborn Thread' });
      mockThreadManager.getThread.mockReturnValue(thread);
      mockThreadManager.deleteThread.mockReturnValue(false);

      const result = await manageThreadsHandler.execute({ action: 'delete', thread_id: 'thread-1' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Impossible de supprimer');
    });
  });

  describe('clear action', () => {
    it('should clear thread messages and return success', async () => {
      const result = await manageThreadsHandler.execute({ action: 'clear', thread_id: 'thread-1' }, ctx);

      expect(result.success).toBe(true);
      expect(mockThreadManager.clearThreadMessages).toHaveBeenCalledWith('thread-1');
      expect(result.message).toContain('thread-1');
      expect(result.message).toContain('effac');
    });

    it('should return error if no thread_id provided', async () => {
      const result = await manageThreadsHandler.execute({ action: 'clear' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('thread_id');
      expect(result.error).toContain('requis');
    });
  });

  describe('unknown action', () => {
    it('should return error for unknown action', async () => {
      const result = await manageThreadsHandler.execute({ action: 'unknown_action' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Action inconnue');
      expect(result.error).toContain('unknown_action');
    });
  });

  describe('error handling', () => {
    it('should catch errors and return formatted error message', async () => {
      mockThreadManager.listThreads.mockImplementation(() => {
        throw new Error('Thread storage corrupted');
      });

      const result = await manageThreadsHandler.execute({ action: 'list' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Erreur gestion threads');
      expect(result.error).toContain('Thread storage corrupted');
    });
  });
});
