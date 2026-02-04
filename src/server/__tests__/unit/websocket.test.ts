/**
 * Unit tests for WebSocketManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Use vi.hoisted for all mocks referenced in vi.mock factories
const { mockThreadManager, mockTokenTracker, MockWebSocket, MockWebSocketServer } = vi.hoisted(() => {
  // Import EventEmitter synchronously (Node built-in, available in hoisted context)
  const { EventEmitter: EE } = require('events');

  class MockWS extends EE {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1; // OPEN
    send = vi.fn();
    close = vi.fn();
  }

  class MockWSS extends EE {
    close = vi.fn();
  }

  return {
    mockThreadManager: {
      getThread: vi.fn().mockReturnValue({ id: 'thread-main', title: 'Main', isMain: true }),
      getMainThread: vi.fn().mockReturnValue({ id: 'thread-main', title: 'Main', isMain: true }),
      createThread: vi.fn().mockReturnValue('thread-new'),
      setActiveThread: vi.fn(),
      releaseClient: vi.fn(),
      getThreadMessages: vi.fn().mockReturnValue([]),
      getThreadMessageCount: vi.fn().mockReturnValue(0),
      renameThread: vi.fn(),
      deleteThread: vi.fn(),
      listThreads: vi.fn().mockReturnValue([]),
      clearThreadMessages: vi.fn(),
      createSubThread: vi.fn().mockReturnValue('sub-thread-1'),
    },
    mockTokenTracker: {
      getStats: vi.fn().mockReturnValue({
        estimatedContextTokens: 0,
        sessionInputTokens: 0,
        sessionOutputTokens: 0,
        sessionTotalCost: 0,
        lastRequestInputTokens: 0,
        lastRequestOutputTokens: 0,
        lastRequestCost: 0,
        contextLimit: 200000,
        contextUsagePercent: 0,
      }),
    },
    MockWebSocket: MockWS,
    MockWebSocketServer: MockWSS,
  };
});

vi.mock('ws', () => ({
  WebSocketServer: vi.fn(() => new MockWebSocketServer()),
  WebSocket: MockWebSocket,
}));

vi.mock('../../../core/thread-manager.js', () => ({
  getThreadManager: vi.fn(() => mockThreadManager),
}));

vi.mock('../../../core/token-tracker.js', () => ({
  getTokenTracker: vi.fn(() => mockTokenTracker),
}));

import { WebSocketManager } from '../../websocket.js';
import { WebSocket } from 'ws';

// Helper to create a mock HTTP server
function createMockServer(): any {
  return new EventEmitter();
}

// Helper to simulate a client connection
function simulateConnection(wsManager: WebSocketManager, queryString: string = ''): { ws: MockWebSocket; wss: MockWebSocketServer } {
  // Access the internal WSS
  const wss = (wsManager as any).wss as MockWebSocketServer;
  const ws = new MockWebSocket();
  const req = { url: `/${queryString}`, headers: {} };

  wss.emit('connection', ws, req);
  return { ws, wss };
}

describe('WebSocketManager', () => {
  let wsManager: WebSocketManager;
  let mockServer: any;

  beforeEach(() => {
    mockServer = createMockServer();
    wsManager = new WebSocketManager(mockServer);
  });

  describe('constructor', () => {
    it('should create a WebSocketManager instance', () => {
      expect(wsManager).toBeDefined();
    });

    it('should have zero clients initially', () => {
      expect(wsManager.getClientCount()).toBe(0);
    });
  });

  describe('client connection', () => {
    it('should register a client on connection', () => {
      simulateConnection(wsManager);
      expect(wsManager.getClientCount()).toBe(1);
    });

    it('should send connected message to client', () => {
      const { ws } = simulateConnection(wsManager);
      expect(ws.send).toHaveBeenCalled();

      const sentMessage = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('connected');
      expect(sentMessage.payload.threadId).toBeDefined();
      expect(sentMessage.payload.clientId).toBeDefined();
    });

    it('should use requested thread_id from query params', () => {
      mockThreadManager.getThread.mockReturnValueOnce({ id: 'custom-thread', title: 'Custom' });

      const { ws } = simulateConnection(wsManager, '?thread_id=custom-thread');

      const sentMessages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      const connectedMsg = sentMessages.find((m: any) => m.type === 'connected');
      expect(connectedMsg.payload.threadId).toBe('custom-thread');
    });

    it('should fall back to main thread if requested thread not found', () => {
      mockThreadManager.getThread.mockReturnValueOnce(null); // requested thread not found
      mockThreadManager.getMainThread.mockReturnValueOnce({ id: 'thread-main' });

      simulateConnection(wsManager, '?thread_id=nonexistent');

      expect(mockThreadManager.setActiveThread).toHaveBeenCalledWith(
        expect.any(String),
        'thread-main'
      );
    });

    it('should call onFirstConnection callback on first connection only', () => {
      const callback = vi.fn();
      wsManager.setOnFirstConnection(callback);

      simulateConnection(wsManager);
      expect(callback).toHaveBeenCalledTimes(1);

      simulateConnection(wsManager);
      expect(callback).toHaveBeenCalledTimes(1); // Still only once
    });
  });

  describe('client disconnection', () => {
    it('should remove client on close', () => {
      const { ws } = simulateConnection(wsManager);
      expect(wsManager.getClientCount()).toBe(1);

      ws.emit('close');
      expect(wsManager.getClientCount()).toBe(0);
    });

    it('should release client from thread manager on close', () => {
      const { ws } = simulateConnection(wsManager);
      ws.emit('close');
      expect(mockThreadManager.releaseClient).toHaveBeenCalled();
    });

    it('should handle client error', () => {
      const { ws } = simulateConnection(wsManager);
      ws.emit('error', new Error('connection lost'));
      expect(wsManager.getClientCount()).toBe(0);
      expect(mockThreadManager.releaseClient).toHaveBeenCalled();
    });
  });

  describe('message handling', () => {
    it('should handle user_message type', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      wsManager.setMessageHandler(handler);

      const { ws } = simulateConnection(wsManager);

      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'user_message',
        payload: { text: 'hello bot' },
      })));

      // Wait for async handler
      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalledWith(
          'hello bot',
          expect.any(String),
          expect.objectContaining({
            clientId: expect.any(String),
            ws,
          })
        );
      });
    });

    it('should handle stop message in user_message text', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const stopHandler = vi.fn();
      wsManager.setMessageHandler(handler);
      wsManager.setStopHandler(stopHandler);

      const { ws } = simulateConnection(wsManager);

      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'user_message',
        payload: { text: 'stop' },
      })));

      await vi.waitFor(() => {
        expect(stopHandler).toHaveBeenCalled();
      });

      // Verify the message handler was NOT called
      expect(handler).not.toHaveBeenCalled();

      // Verify stopped confirmation was sent
      const sentMessages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      const stoppedMsg = sentMessages.find((m: any) => m.type === 'stopped');
      expect(stoppedMsg).toBeDefined();
    });

    it('should handle stop message type', async () => {
      const stopHandler = vi.fn();
      wsManager.setStopHandler(stopHandler);

      const { ws } = simulateConnection(wsManager);

      ws.emit('message', Buffer.from(JSON.stringify({ type: 'stop' })));

      await vi.waitFor(() => {
        expect(stopHandler).toHaveBeenCalled();
      });
    });

    it('should handle switch_thread message', async () => {
      const { ws } = simulateConnection(wsManager);

      mockThreadManager.getThread.mockReturnValueOnce({ id: 'thread-2', title: 'Thread 2' });

      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'switch_thread',
        payload: { threadId: 'thread-2' },
      })));

      await vi.waitFor(() => {
        const sentMessages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
        const switchMsg = sentMessages.find((m: any) => m.type === 'thread_switched');
        expect(switchMsg).toBeDefined();
        expect(switchMsg.payload.threadId).toBe('thread-2');
      });
    });

    it('should handle create_thread message', async () => {
      const { ws } = simulateConnection(wsManager);

      // After creating, switchThread will be called internally
      mockThreadManager.getThread.mockReturnValueOnce({ id: 'thread-new', title: 'New Thread' });

      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'create_thread',
        payload: { title: 'New Thread' },
      })));

      await vi.waitFor(() => {
        expect(mockThreadManager.createThread).toHaveBeenCalledWith('New Thread');
      });
    });

    it('should handle rename_thread message', async () => {
      const { ws } = simulateConnection(wsManager);

      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'rename_thread',
        payload: { threadId: 'thread-1', title: 'Renamed' },
      })));

      await vi.waitFor(() => {
        expect(mockThreadManager.renameThread).toHaveBeenCalledWith('thread-1', 'Renamed');
      });
    });

    it('should handle delete_thread message', async () => {
      const { ws } = simulateConnection(wsManager);

      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'delete_thread',
        payload: { threadId: 'thread-to-delete' },
      })));

      await vi.waitFor(() => {
        expect(mockThreadManager.deleteThread).toHaveBeenCalledWith('thread-to-delete');
      });
    });

    it('should handle list_threads message', async () => {
      mockThreadManager.listThreads.mockReturnValueOnce([
        { id: 'thread-1', title: 'Thread 1' },
        { id: 'thread-2', title: 'Thread 2' },
      ]);

      const { ws } = simulateConnection(wsManager);

      ws.emit('message', Buffer.from(JSON.stringify({ type: 'list_threads' })));

      await vi.waitFor(() => {
        const sentMessages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
        const listMsg = sentMessages.find((m: any) => m.type === 'threads_list');
        expect(listMsg).toBeDefined();
        expect(listMsg.payload.threads).toHaveLength(2);
      });
    });

    it('should handle clear_thread message', async () => {
      const { ws } = simulateConnection(wsManager);

      ws.emit('message', Buffer.from(JSON.stringify({ type: 'clear_thread' })));

      await vi.waitFor(() => {
        expect(mockThreadManager.clearThreadMessages).toHaveBeenCalled();
      });
    });

    it('should handle create_sub_thread message', async () => {
      const { ws } = simulateConnection(wsManager);

      mockThreadManager.getThread.mockReturnValueOnce({ id: 'sub-thread-1', title: 'Sub Thread' });

      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'create_sub_thread',
        payload: { parentThreadId: 'thread-main', title: 'Sub Thread' },
      })));

      await vi.waitFor(() => {
        expect(mockThreadManager.createSubThread).toHaveBeenCalledWith('thread-main', 'Sub Thread');
      });
    });

    it('should handle load_more_history message', async () => {
      const { ws } = simulateConnection(wsManager);

      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'load_more_history',
        payload: { offset: 50, limit: 25 },
      })));

      await vi.waitFor(() => {
        expect(mockThreadManager.getThreadMessages).toHaveBeenCalledWith(
          expect.any(String), 25, 50
        );
      });
    });

    it('should handle invalid JSON gracefully', () => {
      const { ws } = simulateConnection(wsManager);

      // Should not throw
      expect(() => {
        ws.emit('message', Buffer.from('not valid json'));
      }).not.toThrow();
    });
  });

  describe('sendTo', () => {
    it('should send message to open websocket', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      wsManager.sendTo(ws as any, { type: 'system', payload: { message: 'test' } });

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('system');
      expect(sent.payload.message).toBe('test');
      expect(sent.timestamp).toBeDefined();
    });

    it('should not send to closed websocket', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();
      ws.readyState = MockWebSocket.CLOSED;

      wsManager.sendTo(ws as any, { type: 'system', payload: {} });
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('sendToClient', () => {
    it('should send message to client by ID', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      // Get the client ID from the connected message
      const connectedMsg = JSON.parse(ws.send.mock.calls[0]?.[0] || '{}');
      // We can't get clientId from mock calls that were cleared, use internal state
      const clients = (wsManager as any).clients as Map<any, any>;
      const client = clients.get(ws);
      const clientId = client?.clientId;

      if (clientId) {
        const result = wsManager.sendToClient(clientId, { type: 'system', payload: {} });
        expect(result).toBe(true);
      }
    });

    it('should return false for unknown client', () => {
      const result = wsManager.sendToClient('unknown-client', { type: 'system', payload: {} });
      expect(result).toBe(false);
    });
  });

  describe('broadcastToThread', () => {
    it('should send to all clients on the same thread', () => {
      const { ws: ws1 } = simulateConnection(wsManager);
      const { ws: ws2 } = simulateConnection(wsManager);
      ws1.send.mockClear();
      ws2.send.mockClear();

      wsManager.broadcastToThread('thread-main', { type: 'bot_message', payload: { text: 'hello' } });

      expect(ws1.send).toHaveBeenCalledTimes(1);
      expect(ws2.send).toHaveBeenCalledTimes(1);
    });

    it('should not send to clients on different threads', () => {
      const { ws: ws1 } = simulateConnection(wsManager);
      ws1.send.mockClear();

      // Manually change one client's thread
      const clients = (wsManager as any).clients as Map<any, any>;
      const client = clients.get(ws1);
      if (client) client.threadId = 'other-thread';

      wsManager.broadcastToThread('thread-main', { type: 'bot_message', payload: {} });

      expect(ws1.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('should send to all connected clients', () => {
      const { ws: ws1 } = simulateConnection(wsManager);
      const { ws: ws2 } = simulateConnection(wsManager);
      ws1.send.mockClear();
      ws2.send.mockClear();

      wsManager.broadcast({ type: 'restart_signal', payload: { reason: 'update' } });

      expect(ws1.send).toHaveBeenCalledTimes(1);
      expect(ws2.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('helper send methods', () => {
    it('sendBotMessage should broadcast to thread', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      wsManager.sendBotMessage('thread-main', 'Hello world');

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('bot_message');
      expect(sent.payload.text).toBe('Hello world');
    });

    it('sendStreamChunk should broadcast to thread', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      wsManager.sendStreamChunk('thread-main', 'chunk');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('stream_chunk');
    });

    it('sendBotTyping should broadcast typing state', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      wsManager.sendBotTyping('thread-main', true);

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('bot_typing');
      expect(sent.payload.isTyping).toBe(true);
    });

    it('sendToolUse should broadcast tool use', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      wsManager.sendToolUse('thread-main', 'read_file', { path: 'test.ts' }, 'exec-1');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('tool_use');
      expect(sent.payload.tool).toBe('read_file');
      expect(sent.payload.executionId).toBe('exec-1');
    });

    it('sendToolResult should broadcast tool result', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      wsManager.sendToolResult('thread-main', 'read_file', { success: true }, 'exec-1');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('tool_result');
      expect(sent.payload.tool).toBe('read_file');
    });

    it('sendSystem should broadcast to thread when threadId provided', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      wsManager.sendSystem('thread-main', 'System message');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('system');
      expect(sent.payload.message).toBe('System message');
    });

    it('sendSystem should broadcast to all when threadId is null', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      wsManager.sendSystem(null, 'Global message');

      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    it('sendError should send to specific client', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      wsManager.sendError(ws as any, 'Something failed', 'thread-main');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.payload.error).toBe('Something failed');
    });

    it('sendUsage should broadcast usage stats', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      wsManager.sendUsage('thread-main', 100, 50, { input_cost: 0.01, output_cost: 0.02, total_cost: 0.03 });

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('usage');
      expect(sent.payload.input_tokens).toBe(100);
      expect(sent.payload.output_tokens).toBe(50);
      expect(sent.payload.cost.total_cost).toBe(0.03);
    });

    it('sendTokenUpdate should broadcast token stats', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      const stats = {
        estimatedContextTokens: 5000,
        sessionInputTokens: 3000,
        sessionOutputTokens: 2000,
        sessionTotalCost: 0.05,
        lastRequestInputTokens: 1000,
        lastRequestOutputTokens: 500,
        lastRequestCost: 0.01,
        contextLimit: 200000,
        contextUsagePercent: 2.5,
      };
      wsManager.sendTokenUpdate('thread-main', stats);

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('token_update');
      expect(sent.payload.estimatedContextTokens).toBe(5000);
    });

    it('sendProviderSwitch should broadcast provider change', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      wsManager.sendProviderSwitch('thread-main', 'claude', 'kimi', 'user_request');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('provider_switch');
      expect(sent.payload.from).toBe('claude');
      expect(sent.payload.to).toBe('kimi');
    });

    it('sendRestartSignal should broadcast to all clients', () => {
      const { ws } = simulateConnection(wsManager);
      ws.send.mockClear();

      wsManager.sendRestartSignal('Code update');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('restart_signal');
      expect(sent.payload.reason).toBe('Code update');
    });
  });

  describe('client info', () => {
    it('getClientThreadId should return thread for connected client', () => {
      const { ws } = simulateConnection(wsManager);
      expect(wsManager.getClientThreadId(ws as any)).toBe('thread-main');
    });

    it('getClientThreadId should return null for unknown client', () => {
      const unknown = new MockWebSocket();
      expect(wsManager.getClientThreadId(unknown as any)).toBeNull();
    });

    it('getClientId should return clientId for connected client', () => {
      const { ws } = simulateConnection(wsManager);
      const clientId = wsManager.getClientId(ws as any);
      expect(clientId).toBeTruthy();
      expect(clientId).toContain('client_');
    });

    it('getClientCount should return number of connected clients', () => {
      expect(wsManager.getClientCount()).toBe(0);
      simulateConnection(wsManager);
      expect(wsManager.getClientCount()).toBe(1);
      simulateConnection(wsManager);
      expect(wsManager.getClientCount()).toBe(2);
    });

    it('getThreadClientCount should count clients in specific thread', () => {
      simulateConnection(wsManager);
      simulateConnection(wsManager);
      expect(wsManager.getThreadClientCount('thread-main')).toBe(2);
      expect(wsManager.getThreadClientCount('other-thread')).toBe(0);
    });
  });

  describe('close', () => {
    it('should close all connections and clear clients', () => {
      const { ws: ws1 } = simulateConnection(wsManager);
      const { ws: ws2 } = simulateConnection(wsManager);

      wsManager.close();

      expect(ws1.close).toHaveBeenCalled();
      expect(ws2.close).toHaveBeenCalled();
      expect(wsManager.getClientCount()).toBe(0);
    });
  });
});
