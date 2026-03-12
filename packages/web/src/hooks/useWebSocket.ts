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
  onMessage: (msg: ServerMessage) => void,
  getAccessToken: () => string | null,
  accessToken: string | null,
  refreshAccessToken?: () => Promise<string | null>,
): UseWebSocketResult {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryDelay = useRef(1000);
  const onMessageRef = useRef(onMessage);
  const getAccessTokenRef = useRef(getAccessToken);
  const refreshAccessTokenRef = useRef(refreshAccessToken);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshingAuthRef = useRef(false);
  onMessageRef.current = onMessage;
  getAccessTokenRef.current = getAccessToken;
  refreshAccessTokenRef.current = refreshAccessToken;

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      const token = getAccessTokenRef.current();
      if (token) {
        ws.send(JSON.stringify({ type: 'auth', token }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        if (msg.type === 'connected') {
          setConnected(true);
          retryDelay.current = 1000;
        } else if (msg.type === 'error') {
          console.warn('[ws] Authentication failed:', msg.message);
          if (msg.message === 'Unauthorized' && refreshAccessTokenRef.current && !refreshingAuthRef.current) {
            refreshingAuthRef.current = true;
            void refreshAccessTokenRef.current()
              .catch(() => null)
              .finally(() => {
                refreshingAuthRef.current = false;
              });
          }
        }
        onMessageRef.current(msg);
      } catch {
        // Ignore malformed JSON from the socket.
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (refreshingAuthRef.current) {
        return;
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 16000);
        connect();
      }, retryDelay.current);
    };

    ws.onerror = (err) => {
      console.error('[ws] error', err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
      setConnected(false);
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (!accessToken) {
      return;
    }

    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [accessToken, connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('[ws] not connected, message dropped:', msg);
    }
  }, []);

  return { send, connected };
}
