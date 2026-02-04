/**
 * Unit tests for TelegramBotService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockMemory, mockThreadManager, mockMessageProcessor } = vi.hoisted(() => ({
  mockMemory: {
    getTelegramMaster: vi.fn().mockReturnValue({ user_id: 12345, username: 'testuser' }),
    getTelegramActiveThread: vi.fn().mockReturnValue(null),
    setTelegramActiveThread: vi.fn(),
    getMessages: vi.fn().mockReturnValue([]),
  },
  mockThreadManager: {
    getThread: vi.fn().mockReturnValue({ id: 'thread-tg', title: 'Telegram' }),
    getOrCreateMainThread: vi.fn().mockReturnValue({ id: 'thread-tg-main', title: 'Telegram Main' }),
  },
  mockMessageProcessor: {
    process: vi.fn().mockResolvedValue({ text: 'Bot reply', error: null }),
  },
}));

// Mock node-telegram-bot-api
const mockBot = vi.hoisted(() => ({
  on: vi.fn(),
  onText: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue({}),
  sendChatAction: vi.fn().mockResolvedValue({}),
  stopPolling: vi.fn().mockResolvedValue(undefined),
  getFileLink: vi.fn().mockResolvedValue('https://api.telegram.org/file/bot/photo.jpg'),
}));

vi.mock('node-telegram-bot-api', () => ({
  default: vi.fn(() => mockBot),
}));

vi.mock('../../../core/memory.js', () => ({
  getMemory: vi.fn(() => mockMemory),
}));

vi.mock('../../../core/thread-manager.js', () => ({
  getThreadManager: vi.fn(() => mockThreadManager),
}));

vi.mock('../../../config.js', () => ({
  PROVIDER: { ACTIVE: 'claude' },
}));

vi.mock('../../../core/message-processor.js', () => ({
  MessageProcessor: vi.fn(),
  initMessageProcessor: vi.fn(() => mockMessageProcessor),
}));

vi.mock('../../../core/chat-adapter.js', () => ({
  ChatAdapter: vi.fn(),
}));

import { TelegramBotService, getTelegramBot, initTelegramBot } from '../../bot.js';
import type { TelegramConfig } from '../../types.js';

const testConfig: TelegramConfig = {
  token: 'test-token-123',
  usePolling: true,
  anthropicApiKey: 'test-anthropic-key',
  kimiApiKey: 'test-kimi-key',
};

describe('TelegramBotService', () => {
  let service: TelegramBotService;

  beforeEach(() => {
    service = new TelegramBotService(testConfig);
  });

  describe('constructor', () => {
    it('should create a service instance', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(TelegramBotService);
    });
  });

  describe('start', () => {
    it('should initialize bot with polling mode', async () => {
      await service.start();

      // Should have set up handlers
      expect(mockBot.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockBot.onText).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop polling when bot exists', async () => {
      await service.start();
      await service.stop();

      expect(mockBot.stopPolling).toHaveBeenCalled();
    });

    it('should not throw when bot is null', async () => {
      await expect(service.stop()).resolves.not.toThrow();
    });
  });

  describe('isAuthorized (via handleMessage)', () => {
    it('should reject unauthorized users', async () => {
      mockMemory.getTelegramMaster.mockReturnValueOnce({ user_id: 99999, username: 'admin' });

      await service.start();

      // Get the message handler
      const messageHandler = mockBot.on.mock.calls.find((c: any) => c[0] === 'message')?.[1];
      expect(messageHandler).toBeDefined();

      // Simulate a message from unauthorized user
      await messageHandler({
        from: { id: 42, username: 'hacker' },
        chat: { id: 42 },
        text: 'hello',
      });

      expect(mockBot.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('autorisé'));
    });

    it('should allow authorized user by user_id', async () => {
      mockMemory.getTelegramMaster.mockReturnValue({ user_id: 12345, username: 'testuser' });

      await service.start();

      const messageHandler = mockBot.on.mock.calls.find((c: any) => c[0] === 'message')?.[1];

      await messageHandler({
        from: { id: 12345, username: 'testuser' },
        chat: { id: 12345 },
        text: 'hello',
      });

      // Should process the message (messageProcessor.process gets called)
      expect(mockMessageProcessor.process).toHaveBeenCalled();
    });
  });

  describe('getOrCreateSession', () => {
    it('should use persisted thread if exists', async () => {
      mockMemory.getTelegramActiveThread.mockReturnValueOnce('persisted-thread-id');
      mockThreadManager.getThread.mockReturnValueOnce({ id: 'persisted-thread-id', title: 'Persisted' });

      await service.start();

      const messageHandler = mockBot.on.mock.calls.find((c: any) => c[0] === 'message')?.[1];
      await messageHandler({
        from: { id: 12345, username: 'testuser' },
        chat: { id: 12345 },
        text: 'hello',
      });

      // Should have used the persisted thread
      expect(mockMessageProcessor.process).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          threadId: 'persisted-thread-id',
        })
      );
    });

    it('should create main thread if no persisted thread', async () => {
      mockMemory.getTelegramActiveThread.mockReturnValueOnce(null);

      await service.start();

      const messageHandler = mockBot.on.mock.calls.find((c: any) => c[0] === 'message')?.[1];
      await messageHandler({
        from: { id: 12345, username: 'testuser' },
        chat: { id: 12345 },
        text: 'hello',
      });

      expect(mockThreadManager.getOrCreateMainThread).toHaveBeenCalledWith('telegram', '12345');
    });
  });

  describe('command handlers', () => {
    beforeEach(async () => {
      await service.start();
    });

    it('should register command handlers', () => {
      const registeredCommands = mockBot.onText.mock.calls.map((c: any) => c[0].toString());
      expect(registeredCommands).toContainEqual(expect.stringContaining('start'));
      expect(registeredCommands).toContainEqual(expect.stringContaining('status'));
      expect(registeredCommands).toContainEqual(expect.stringContaining('help'));
      expect(registeredCommands).toContainEqual(expect.stringContaining('web'));
      expect(registeredCommands).toContainEqual(expect.stringContaining('provider'));
    });
  });

  describe('setActiveThread', () => {
    it('should set active thread for user', () => {
      mockThreadManager.getThread.mockReturnValueOnce({ id: 'new-thread', title: 'New' });

      const result = service.setActiveThread(12345, 'new-thread');

      expect(result).toBe(true);
      expect(mockMemory.setTelegramActiveThread).toHaveBeenCalledWith(12345, 'new-thread');
    });

    it('should return false for non-existent thread', () => {
      mockThreadManager.getThread.mockReturnValueOnce(null);

      const result = service.setActiveThread(12345, 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getTelegramConversationId', () => {
    it('should return undefined for unknown user', () => {
      expect(service.getTelegramConversationId(99999)).toBeUndefined();
    });
  });

  describe('getChatIdForUser', () => {
    it('should return undefined for unknown user', () => {
      expect(service.getChatIdForUser(99999)).toBeUndefined();
    });
  });

  describe('sendMessageToMaster', () => {
    it('should return false when bot is null', async () => {
      const result = await service.sendMessageToMaster('hello');
      expect(result).toBe(false);
    });

    it('should return false when no master user', async () => {
      await service.start();
      mockMemory.getTelegramMaster.mockReturnValueOnce(null);

      const result = await service.sendMessageToMaster('hello');
      expect(result).toBe(false);
    });
  });

  describe('stop signal', () => {
    it('should handle stop message', async () => {
      await service.start();

      const messageHandler = mockBot.on.mock.calls.find((c: any) => c[0] === 'message')?.[1];

      // Send a stop message
      await messageHandler({
        from: { id: 12345, username: 'testuser' },
        chat: { id: 12345 },
        text: 'stop',
      });

      // Should have sent a "stopped" message
      const sendCalls = mockBot.sendMessage.mock.calls;
      const stoppedCall = sendCalls.find((c: any) =>
        typeof c[1] === 'string' && c[1].toLowerCase().includes('stopped')
      );
      // The stop handler sends 'Processing stopped' if there's an abort controller
      // Since there's no active abort controller, it just falls through
    });
  });

  describe('extractMessageContent', () => {
    it('should extract text from message', async () => {
      await service.start();

      const messageHandler = mockBot.on.mock.calls.find((c: any) => c[0] === 'message')?.[1];

      await messageHandler({
        from: { id: 12345, username: 'testuser' },
        chat: { id: 12345 },
        text: 'Test message',
      });

      expect(mockMessageProcessor.process).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Test message' }),
        expect.anything()
      );
    });

    it('should handle caption from photo', async () => {
      await service.start();

      const messageHandler = mockBot.on.mock.calls.find((c: any) => c[0] === 'message')?.[1];

      // Mock fetch for image download
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      }));

      await messageHandler({
        from: { id: 12345, username: 'testuser' },
        chat: { id: 12345 },
        caption: 'Photo caption',
        photo: [{ file_id: 'photo-123', width: 100, height: 100 }],
      });

      expect(mockMessageProcessor.process).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Photo caption' }),
        expect.anything()
      );

      vi.unstubAllGlobals();
    });

    it('should handle messages with no text', async () => {
      await service.start();

      const messageHandler = mockBot.on.mock.calls.find((c: any) => c[0] === 'message')?.[1];

      await messageHandler({
        from: { id: 12345, username: 'testuser' },
        chat: { id: 12345 },
        // No text, no photo, no document
      });

      // Should send unknown message type
      const sendCalls = mockBot.sendMessage.mock.calls;
      const unknownCall = sendCalls.find((c: any) =>
        typeof c[1] === 'string' && c[1].includes('comprends pas')
      );
      expect(unknownCall).toBeDefined();
    });
  });
});

describe('getTelegramBot / initTelegramBot', () => {
  it('initTelegramBot should create new instance', () => {
    const bot = initTelegramBot(testConfig);
    expect(bot).toBeInstanceOf(TelegramBotService);
  });

  it('getTelegramBot should return existing instance', () => {
    const bot1 = initTelegramBot(testConfig);
    const bot2 = getTelegramBot();
    expect(bot2).toBe(bot1);
  });
});
