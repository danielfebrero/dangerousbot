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

  // Helper pour mettre à jour l'URL avec le thread_id
  const updateUrlWithThreadId = useCallback((threadId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('thread_id', threadId);
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Helper pour lire le thread_id depuis l'URL
  const getThreadIdFromUrl = useCallback((): string | undefined => {
    const url = new URL(window.location.href);
    return url.searchParams.get('thread_id') || undefined;
  }, []);

  const connect = useCallback((threadId?: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${protocol}//${window.location.host}`;
    
    // Utiliser le thread_id fourni, ou celui de l'URL, ou laisser vide pour créer un nouveau
    const finalThreadId = threadId || getThreadIdFromUrl();
    
    // Ajouter le thread_id dans l'URL WS si fourni
    if (finalThreadId) {
      wsUrl += `?thread_id=${finalThreadId}`;
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
            // Mettre à jour l'URL avec le thread_id reçu du serveur
            updateUrlWithThreadId(message.payload.threadId);
            break;
            
          case 'thread_switched':
            setCurrentThreadId(message.payload.threadId);
            // Mettre à jour l'URL quand on change de thread
            updateUrlWithThreadId(message.payload.threadId);
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

  const forceRestart = useCallback((reason?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'force_restart',
        payload: { reason: reason || 'Force restart par l\'utilisateur' }
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
    forceRestart,
  };
}
