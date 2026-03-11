import { useEffect, useRef, useState, useCallback } from 'react';

export interface AIStreamMessage {
  type: 'token' | 'done' | 'error';
  content?: string;
  message?: string;
}

export interface UseAIStreamResult {
  streaming: boolean;
  send: (message: string) => Promise<void>;
}

/**
 * SSE hook for AI response streaming using fetch stream reader.
 * Sends chat messages via POST /api/chat and receives streamed tokens.
 *
 * @param onMessage - Callback called when SSE message received
 * @param getAccessToken - Function to get current access token
 * @returns { streaming, send } - Streaming status and send function
 */
export function useAIStream(
  onMessage: (msg: AIStreamMessage) => void,
  getAccessToken: () => string | null
): UseAIStreamResult {
  const [streaming, setStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onMessageRef = useRef(onMessage);
  const getAccessTokenRef = useRef(getAccessToken);

  onMessageRef.current = onMessage;
  getAccessTokenRef.current = getAccessToken;

  const send = useCallback(async (message: string) => {
    const token = getAccessTokenRef.current();
    if (!token) {
      console.error('[useAIStream] No access token');
      return;
    }

    // Abort any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setStreaming(true);

    try {
      // Open the SSE stream before triggering the agent run, otherwise a fast
      // response can complete before the client starts reading events.
      const streamResponse = await fetch('/stream/ai', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal: abortControllerRef.current.signal,
      });

      if (!streamResponse.ok) {
        throw new Error(`HTTP ${streamResponse.status}: ${streamResponse.statusText}`);
      }

      const reader = streamResponse.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      // Trigger the agent only after the SSE stream is ready.
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (!data) continue; // Skip empty data lines

            try {
              const msg = JSON.parse(data) as AIStreamMessage;
              onMessageRef.current(msg);

              if (msg.type === 'done' || msg.type === 'error') {
                setStreaming(false);
              }
            } catch (err) {
              console.error('[useAIStream] Failed to parse SSE data:', err);
            }
          }
        }
      }

      setStreaming(false);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        console.log('[useAIStream] Stream aborted');
      } else {
        console.error('[useAIStream] Error:', err);
        onMessageRef.current({ type: 'error', message: String(err) });
      }
      setStreaming(false);
    } finally {
      abortControllerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { streaming, send };
}
