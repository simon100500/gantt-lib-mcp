import { useEffect, useRef, useState, useCallback } from 'react';

export interface TaskStreamMessage {
  type: 'connected' | 'error';
  message?: string;
}

export interface UseTaskStreamResult {
  connected: boolean;
}

/**
 * SSE hook for AI streaming only using EventSource.
 * Automatically reconnects with exponential backoff on connection failure.
 *
 * Note: This is for AI token streaming only, not task sync.
 * Task sync uses explicit GET/PUT /api/tasks operations.
 *
 * @param onMessage - Callback called when SSE message received
 * @param getAccessToken - Function to get current access token
 * @returns { connected } - Connection status
 */
export function useTaskStream(
  onMessage: (msg: TaskStreamMessage) => void,
  getAccessToken: () => string | null,
  clientId?: string,
): UseTaskStreamResult {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryDelay = useRef(1000);
  const onMessageRef = useRef(onMessage);
  const getAccessTokenRef = useRef(getAccessToken);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onMessageRef.current = onMessage;
  getAccessTokenRef.current = getAccessToken;

  const connect = useCallback(() => {
    const token = getAccessTokenRef.current();
    if (!token) {
      console.warn('[useTaskStream] No access token, skipping connection');
      return;
    }

    console.log('[useTaskStream] Connecting with token (first 30 chars):', token.substring(0, 30));
    const url = `/stream/ai?token=${encodeURIComponent(token)}`;
    console.log('[useTaskStream] URL:', url);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[useTaskStream] Connected');
      setConnected(true);
      retryDelay.current = 1000; // Reset backoff
    };

    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as TaskStreamMessage;
        if (msg.type === 'connected') {
          // Server confirmation
          console.log('[useTaskStream] Server confirmed connection');
        } else if (msg.type === 'error') {
          console.warn('[useTaskStream] Error:', msg.message);
        }
        onMessageRef.current(msg);
      } catch (err) {
        console.error('[useTaskStream] Failed to parse message:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[useTaskStream] Connection error:', err);
      setConnected(false);
      eventSource.close();

      // Reconnect with exponential backoff
      reconnectTimeoutRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 16000);
        connect();
      }, retryDelay.current);
    };
  }, []);

  useEffect(() => {
    // If an existing connection is open, close it without triggering auto-reconnect
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setConnected(false);
    }

    // Clear any pending reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const token = getAccessToken();
    if (!token) {
      console.log('[useTaskStream] No token, not connecting');
      return;
    }

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [getAccessToken(), connect]);

  return { connected };
}
