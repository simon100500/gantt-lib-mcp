import { useEffect, useRef, useState, useCallback } from 'react';

export interface ServerMessage {
  type: 'connected' | 'token' | 'tasks' | 'error' | 'done';
  content?: string;
  tasks?: unknown[];
  message?: string;
}

export interface ClientMessage {
  type: 'chat';
  message: string;
}

export interface UseWebSocketResult {
  send: (msg: ClientMessage) => void;
  connected: boolean;
}

export function useWebSocket(
  onMessage: (msg: ServerMessage) => void
): UseWebSocketResult {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryDelay = useRef(1000);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage; // always latest callback

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryDelay.current = 1000; // reset backoff
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        onMessageRef.current(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect with backoff
      setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 16000);
        connect();
      }, retryDelay.current);
    };

    ws.onerror = (err) => {
      console.error('[ws] error', err);
      ws.close(); // triggers onclose → reconnect
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('[ws] not connected, message dropped:', msg);
    }
  }, []);

  return { send, connected };
}
