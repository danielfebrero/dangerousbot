import { useState, useEffect, useCallback, useRef } from 'react';
import { WSMessage, ConnectionStatus } from '../types';

interface UseWebSocketOptions {
  onMessage: (message: WSMessage) => void;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const { onMessage, reconnectAttempts = 5, reconnectDelay = 1000 } = options;
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      attemptsRef.current = 0;
      // L'historique est envoyé automatiquement par le serveur à la connexion
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;

      // Attempt reconnection
      if (attemptsRef.current < reconnectAttempts) {
        attemptsRef.current++;
        setTimeout(connect, reconnectDelay * attemptsRef.current);
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
        onMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  }, [onMessage, reconnectAttempts, reconnectDelay]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'user_message',
        payload: { text }
      }));
      return true;
    }
    return false;
  }, []);

  return { status, sendMessage };
}
