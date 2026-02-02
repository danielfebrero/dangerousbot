import { useState, useEffect, useCallback, useRef } from 'react';
import { WSMessage, ConnectionStatus, ContentPart } from '../types';

export interface Thread {
  id: string;
  title: string;
  is_main: boolean;
  parent_thread_id: string | null;
  created_at: string;
  updated_at: string;
}

interface UseThreadedWebSocketOptions {
  onMessage: (message: WSMessage) => void;
  onThreadSwitched?: (threadId: string, title: string) => void;
  onThreadsList?: (threads: Thread[], activeThreadId: string) => void;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export function useThreadedWebSocket(options: UseThreadedWebSocketOptions) {
  const { 
    onMessage, 
    onThreadSwitched, 
    onThreadsList,
    reconnectAttempts = 5, 
    reconnectDelay = 1000 
  } = options;
  
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const wasDisconnectedRef = useRef(false);

  const connect = useCallback((threadId?: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${protocol}//${window.location.host}`;
    
    // Ajouter le thread_id dans l'URL si fourni
    if (threadId) {
      wsUrl += `?thread_id=${threadId}`;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      if (wasDisconnectedRef.current) {
        console.log('[WebSocket] Reconnexion après déconnexion');
        wasDisconnectedRef.current = false;
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
      attemptsRef.current = 0;
    };

    ws.onclose = () => {
      wasDisconnectedRef.current = true;
      setStatus('disconnected');
      wsRef.current = null;

      if (attemptsRef.current < reconnectAttempts) {
        attemptsRef.current++;
        setTimeout(() => connect(threadId), reconnectDelay * attemptsRef.current);
      } else {
        setStatus('error');
      }
    };

    ws.onerror = () => {
      setStatus('error');
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        
        // Gérer les messages spécifiques aux threads
        switch (message.type) {
          case 'connected':
            setCurrentThreadId(message.payload.threadId);
            setClientId(message.payload.clientId);
            break;
            
          case 'thread_switched':
            setCurrentThreadId(message.payload.threadId);
            onThreadSwitched?.(message.payload.threadId, message.payload.title);
            break;
            
          case 'threads_list':
            onThreadsList?.(message.payload.threads, message.payload.activeThreadId);
            break;
        }
        
        onMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  }, [onMessage, onThreadSwitched, onThreadsList, reconnectAttempts, reconnectDelay]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((text: string, images?: ContentPart[]) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload: any = { text };
      if (images && images.length > 0) {
        payload.images = images;
      }
      wsRef.current.send(JSON.stringify({
        type: 'user_message',
        payload
      }));
      return true;
    }
    return false;
  }, []);

  const sendStop = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      return true;
    }
    return false;
  }, []);

  // Actions sur les threads
  const createThread = useCallback((title?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'create_thread',
        payload: { title: title || 'New Thread' }
      }));
      return true;
    }
    return false;
  }, []);

  const switchThread = useCallback((threadId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'switch_thread',
        payload: { threadId }
      }));
      return true;
    }
    return false;
  }, []);

  const renameThread = useCallback((threadId: string, title: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'rename_thread',
        payload: { threadId, title }
      }));
      return true;
    }
    return false;
  }, []);

  const deleteThread = useCallback((threadId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'delete_thread',
        payload: { threadId }
      }));
      return true;
    }
    return false;
  }, []);

  const listThreads = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'list_threads' }));
      return true;
    }
    return false;
  }, []);

  const clearThread = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'clear_thread' }));
      return true;
    }
    return false;
  }, []);

  const loadMoreHistory = useCallback((offset: number, limit: number = 100) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'load_more_history',
        payload: { offset, limit }
      }));
      return true;
    }
    return false;
  }, []);

  return {
    status,
    currentThreadId,
    clientId,
    sendMessage,
    sendStop,
    createThread,
    switchThread,
    renameThread,
    deleteThread,
    listThreads,
    clearThread,
    loadMoreHistory,
  };
}
