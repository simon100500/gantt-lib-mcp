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
  accessToken: string | null   // NEW: reactive trigger — reconnect when this changes
): UseWebSocketResult {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryDelay = useRef(1000);
  const onMessageRef = useRef(onMessage);
  const getAccessTokenRef = useRef(getAccessToken);
  onMessageRef.current = onMessage; // always latest callback
  getAccessTokenRef.current = getAccessToken; // always latest callback

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      const token = getAccessTokenRef.current();
      if (token) {
        ws.send(JSON.stringify({ type: 'auth', token }));
      }
      // Don't set connected=true here — wait for server confirmation
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        if (msg.type === 'connected') {
          setConnected(true);
          retryDelay.current = 1000; // reset backoff
        }
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
    // If an existing connection is open, close it without triggering auto-reconnect.
    // Setting onclose = null prevents the exponential backoff handler from racing
    // with this intentional reconnect.
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
      setConnected(false);
    }
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [accessToken]); // Re-run when token changes (null → value after OTP login)

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('[ws] not connected, message dropped:', msg);
    }
  }, []);

  return { send, connected };
}
