/**
 * Unit tests for DangerousBotServer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies with vi.hoisted
const {
  mockBrain,
  mockWsManager,
  mockToolExecutor,
  mockLifecycle,
  mockThreadManager,
  mockTokenTracker,
  mockMemory,
} = vi.hoisted(() => ({
  mockBrain: {
    getCurrentProvider: vi.fn().mockReturnValue({ name: 'claude' }),
    switchProvider: vi.fn(),
    thinkStream: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Hello' }],
      stopReason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost: { input_cost: 0.01, output_cost: 0.02, total_cost: 0.03 },
    }),
    continueAfterToolStream: vi.fn(),
    addToolResult: vi.fn(),
    loadHistory: vi.fn(),
    releaseHistoryManager: vi.fn(),
    initContextSystem: vi.fn(),
    resolveProviderForThread: vi.fn().mockReturnValue('claude'),
  },
  mockWsManager: {
    setMessageHandler: vi.fn(),
    setStopHandler: vi.fn(),
    setOnFirstConnection: vi.fn(),
    sendBotMessage: vi.fn(),
    sendStreamChunk: vi.fn(),
    sendBotTyping: vi.fn(),
    sendToolUse: vi.fn(),
    sendToolResult: vi.fn(),
    sendSystem: vi.fn(),
    sendError: vi.fn(),
    sendUsage: vi.fn(),
    sendTokenUpdate: vi.fn(),
    sendProviderSwitch: vi.fn(),
    sendRestartSignal: vi.fn(),
    sendToClient: vi.fn(),
    close: vi.fn(),
  },
  mockToolExecutor: {
    execute: vi.fn().mockResolvedValue({ success: true }),
  },
  mockLifecycle: {
    restart: vi.fn(),
    checkRestarted: vi.fn().mockReturnValue({ restarted: false }),
    clearRestarted: vi.fn(),
  },
  mockThreadManager: {
    addMessage: vi.fn().mockReturnValue(1),
    getThread: vi.fn().mockReturnValue({ id: 'thread-main', title: 'Main' }),
    getMainThread: vi.fn().mockReturnValue({ id: 'thread-main', title: 'Main' }),
    addToolResult: vi.fn(),
  },
  mockTokenTracker: {
    getStats: vi.fn().mockReturnValue({
      estimatedContextTokens: 1000,
      sessionInputTokens: 100,
      sessionOutputTokens: 50,
      sessionTotalCost: 0.03,
      lastRequestInputTokens: 100,
      lastRequestOutputTokens: 50,
      lastRequestCost: 0.03,
      contextLimit: 200000,
      contextUsagePercent: 0.5,
    }),
    getStatsWithPending: vi.fn().mockReturnValue({
      estimatedContextTokens: 1000,
      sessionInputTokens: 100,
      sessionOutputTokens: 50,
      sessionTotalCost: 0.03,
      lastRequestInputTokens: 100,
      lastRequestOutputTokens: 50,
      lastRequestCost: 0.03,
      contextLimit: 200000,
      contextUsagePercent: 0.5,
    }),
    recordApiCall: vi.fn(),
  },
  mockMemory: {
    getMessages: vi.fn().mockReturnValue([]),
    getSessionId: vi.fn().mockReturnValue('session-1'),
  },
}));

// Mock express and http
vi.mock('express', () => {
  const mockApp: any = {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    listen: vi.fn(),
  };
  const expressFn: any = vi.fn(() => mockApp);
  expressFn.json = vi.fn(() => vi.fn());
  expressFn.urlencoded = vi.fn(() => vi.fn());
  expressFn.static = vi.fn(() => vi.fn());
  expressFn.Router = vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    stack: [],
  }));
  return { default: expressFn, Router: expressFn.Router };
});

vi.mock('http', () => ({
  createServer: vi.fn(() => ({
    listen: vi.fn((_port: number, _host: string, cb: () => void) => cb()),
    close: vi.fn((cb: () => void) => cb()),
  })),
}));

vi.mock('../../websocket.js', () => ({
  WebSocketManager: vi.fn(() => mockWsManager),
}));

vi.mock('../../../core/brain/index.js', () => ({
  Brain: vi.fn(() => mockBrain),
}));

vi.mock('../../../core/tools.js', () => ({
  getToolDefinitions: vi.fn(() => []),
  getToolDefinitionsForProvider: vi.fn(() => []),
  ToolExecutor: vi.fn(() => mockToolExecutor),
}));

vi.mock('../../../core/memory.js', () => ({
  getMemory: vi.fn(() => mockMemory),
}));

vi.mock('../../../core/thread-manager.js', () => ({
  getThreadManager: vi.fn(() => mockThreadManager),
}));

vi.mock('../../../core/lifecycle.js', () => ({
  Lifecycle: vi.fn(() => mockLifecycle),
}));

vi.mock('../../../core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../core/tool-result-store.js', () => ({
  getToolResultStore: vi.fn(() => ({
    saveToolExecution: vi.fn(),
    formatToolSummary: vi.fn().mockReturnValue('Tool summary'),
  })),
}));

vi.mock('../../../core/message-embedder.js', () => ({
  getMessageEmbedder: vi.fn(() => ({
    embedMessageAsync: vi.fn(),
    repairMissingEmbeddings: vi.fn().mockResolvedValue({ repaired: 0, failed: 0 }),
  })),
  initMessageEmbedder: vi.fn(() => ({
    embedMessageAsync: vi.fn(),
    repairMissingEmbeddings: vi.fn().mockResolvedValue({ repaired: 0, failed: 0 }),
  })),
}));

vi.mock('../../../core/compressor.js', () => ({
  getCompressor: vi.fn(() => null),
}));

vi.mock('../../../core/token-tracker.js', () => ({
  getTokenTracker: vi.fn(() => mockTokenTracker),
  initTokenTracker: vi.fn(),
}));

vi.mock('../../../config.js', () => ({
  MEMORY: { TOKEN_LIMIT_FOR_COMPRESSION: 100000 },
}));

vi.mock('../../routes.js', () => ({
  createRoutes: vi.fn(() => vi.fn()),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
}));

import { DangerousBotServer } from '../../index.js';

describe('DangerousBotServer', () => {
  let server: DangerousBotServer;

  beforeEach(() => {
    // Clean up global state
    delete (global as any).__busyThreads;
    delete (global as any).__currentThreadId;
    delete (global as any).__currentClientId;
    delete (global as any).__pendingRestart;
    delete (global as any).__providerSwitched;
    delete (global as any).__pendingProviderSwitch;

    server = new DangerousBotServer({ port: 3000, host: 'localhost' }, '/test/project');
  });

  describe('constructor', () => {
    it('should create server instance', () => {
      expect(server).toBeDefined();
    });

    it('should setup websocket handlers', () => {
      expect(mockWsManager.setMessageHandler).toHaveBeenCalled();
      expect(mockWsManager.setStopHandler).toHaveBeenCalled();
      expect(mockWsManager.setOnFirstConnection).toHaveBeenCalled();
    });
  });

  describe('initBrain', () => {
    it('should initialize brain with API key', () => {
      server.initBrain('test-api-key');
      // Brain constructor should have been called (verified by mock)
      expect((server as any).brain).toBeDefined();
    });

    it('should initialize context system when openRouterApiKey provided', () => {
      server.initBrain('test-key', 'openrouter-key');
      expect(mockBrain.initContextSystem).toHaveBeenCalledWith('openrouter-key', 'test-key');
    });
  });

  describe('loadSessionHistory', () => {
    it('should load history when brain exists and messages present', () => {
      server.initBrain('test-key');
      mockMemory.getMessages.mockReturnValueOnce([{ role: 'user', content: 'hi' }]);

      server.loadSessionHistory();

      expect(mockBrain.loadHistory).toHaveBeenCalled();
    });

    it('should not load history when no messages', () => {
      server.initBrain('test-key');
      mockMemory.getMessages.mockReturnValueOnce([]);
      mockBrain.loadHistory.mockClear();

      server.loadSessionHistory();

      expect(mockBrain.loadHistory).not.toHaveBeenCalled();
    });

    it('should not crash when brain is null', () => {
      expect(() => server.loadSessionHistory()).not.toThrow();
    });
  });

  describe('getWSManager', () => {
    it('should return the websocket manager', () => {
      expect(server.getWSManager()).toBe(mockWsManager);
    });
  });

  describe('processMessage', () => {
    beforeEach(() => {
      server.initBrain('test-key');
    });

    it('should send error when brain is not initialized', async () => {
      const serverNoBrain = new DangerousBotServer({ port: 3001, host: 'localhost' }, '/test');

      await serverNoBrain.processMessage('hello', 'thread-1', {
        clientId: 'client-1',
      });

      expect(mockWsManager.sendToClient).toHaveBeenCalledWith('client-1', expect.objectContaining({
        type: 'error',
      }));
    });

    it('should reject duplicate messages from same client', async () => {
      // Simulate a slow processing message
      mockBrain.thinkStream.mockImplementationOnce(() => new Promise(() => {})); // never resolves

      // Start first message (will hang)
      const p1 = server.processMessage('msg1', 'thread-1', { clientId: 'client-1' });

      // Try second message from same client
      await server.processMessage('msg2', 'thread-1', { clientId: 'client-1' });

      expect(mockWsManager.sendSystem).toHaveBeenCalledWith(
        'thread-1',
        'Un message est déjà en cours de traitement...'
      );

      // Cleanup: abort the pending promise
      (server as any).processingClients.delete('client-1');
    });

    it('should process a simple text response', async () => {
      mockBrain.thinkStream.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Bot reply' }],
        stopReason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 25 },
        cost: { input_cost: 0.005, output_cost: 0.01, total_cost: 0.015 },
      });

      await server.processMessage('hello', 'thread-1', { clientId: 'client-1' });

      // Should have started typing
      expect(mockWsManager.sendBotTyping).toHaveBeenCalledWith('thread-1', true);

      // Should save assistant message
      expect(mockThreadManager.addMessage).toHaveBeenCalledWith(
        'thread-1', 'assistant', 'Bot reply'
      );

      // Should send usage
      expect(mockWsManager.sendUsage).toHaveBeenCalled();

      // Should stop typing
      expect(mockWsManager.sendBotTyping).toHaveBeenCalledWith('thread-1', false);

      // Should release history manager
      expect(mockBrain.releaseHistoryManager).toHaveBeenCalledWith('thread-1');
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      mockBrain.thinkStream.mockRejectedValueOnce(new Error('Request aborted by user'));

      await server.processMessage('hello', 'thread-1', {
        clientId: 'client-1',
        abortSignal: controller.signal,
      });

      expect(mockWsManager.sendSystem).toHaveBeenCalledWith('thread-1', expect.stringContaining('arrêtée'));
    });

    it('should handle errors gracefully', async () => {
      mockBrain.thinkStream.mockRejectedValueOnce(new Error('API error'));

      await server.processMessage('hello', 'thread-1', { clientId: 'client-1' });

      expect(mockWsManager.sendToClient).toHaveBeenCalledWith(
        'client-1',
        expect.objectContaining({
          type: 'error',
          payload: expect.objectContaining({ error: expect.stringContaining('API error') }),
        })
      );
    });

    it('should always release history manager in finally block', async () => {
      mockBrain.thinkStream.mockRejectedValueOnce(new Error('some error'));

      await server.processMessage('hello', 'thread-1', { clientId: 'client-1' });

      expect(mockBrain.releaseHistoryManager).toHaveBeenCalledWith('thread-1');
    });

    it('should always stop typing in finally block', async () => {
      mockBrain.thinkStream.mockRejectedValueOnce(new Error('error'));

      await server.processMessage('hello', 'thread-1', { clientId: 'client-1' });

      expect(mockWsManager.sendBotTyping).toHaveBeenCalledWith('thread-1', false);
    });

    it('should detect provider fallback switch', async () => {
      (global as any).__providerSwitched = { from: 'claude', to: 'kimi', reason: 'rate_limit' };

      mockBrain.thinkStream.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        stopReason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await server.processMessage('hello', 'thread-1', { clientId: 'client-1' });

      expect(mockWsManager.sendProviderSwitch).toHaveBeenCalledWith(
        'thread-1', 'claude', 'kimi', 'rate_limit'
      );
    });

    it('should record API usage in token tracker', async () => {
      mockBrain.thinkStream.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'reply' }],
        stopReason: 'end_turn',
        usage: { input_tokens: 200, output_tokens: 100 },
        cost: { input_cost: 0.01, output_cost: 0.02, total_cost: 0.03 },
      });

      await server.processMessage('hello', 'thread-1', { clientId: 'client-1' });

      expect(mockTokenTracker.recordApiCall).toHaveBeenCalledWith(
        'thread-1', 200, 100,
        { input_cost: 0.01, output_cost: 0.02, total_cost: 0.03 }
      );
    });
  });

  describe('start', () => {
    it('should start listening on configured port', async () => {
      await server.start(3000, 'localhost');
      // No error means success (mocked server.listen calls callback immediately)
    });

    it('should check for restart info', async () => {
      mockLifecycle.checkRestarted.mockReturnValueOnce({
        restarted: true,
        threadId: 'thread-restart',
        source: 'webapp',
      });

      const restartServer = new DangerousBotServer({ port: 3000, host: 'localhost' }, '/test');
      restartServer.initBrain('test-key');
      await restartServer.start();

      expect((restartServer as any).pendingContinuationMessage).toBeTruthy();
      expect((restartServer as any).pendingContinuationThreadId).toBe('thread-restart');
    });
  });

  describe('sendContinuationMessage', () => {
    it('should send continuation message to target thread', () => {
      vi.useFakeTimers();

      (server as any).pendingContinuationMessage = 'Restart complete';
      (server as any).pendingContinuationThreadId = 'thread-1';

      server.sendContinuationMessage();

      vi.advanceTimersByTime(600);

      expect(mockThreadManager.addMessage).toHaveBeenCalledWith(
        expect.any(String), 'assistant', 'Restart complete'
      );
      expect(mockWsManager.sendBotMessage).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should not send if no pending message', () => {
      mockWsManager.sendBotMessage.mockClear();
      server.sendContinuationMessage();
      expect(mockWsManager.sendBotMessage).not.toHaveBeenCalled();
    });
  });

  describe('sendRestartSignal', () => {
    it('should delegate to wsManager', () => {
      server.sendRestartSignal('update');
      expect(mockWsManager.sendRestartSignal).toHaveBeenCalledWith('update');
    });
  });

  describe('stop', () => {
    it('should close websocket and http server', async () => {
      await server.stop();
      expect(mockWsManager.close).toHaveBeenCalled();
    });
  });
});
