import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatState {
  messages: ChatMessage[];
  streamingText: string;
  aiThinking: boolean;
  error: string | null;
  addMessage: (message: Omit<ChatMessage, 'id'> & { id?: string }) => string;
  appendToken: (token: string) => void;
  finishStreaming: () => void;
  setError: (message: string) => void;
  reset: () => void;
}

const initialState = {
  messages: [] as ChatMessage[],
  streamingText: '',
  aiThinking: false,
  error: null as string | null,
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,
  addMessage: ({ id, role, content }) => {
    const messageId = id ?? crypto.randomUUID();
    set((state) => ({
      messages: [...state.messages, { id: messageId, role, content }],
      error: null,
      aiThinking: role === 'user' ? true : false,
      streamingText: role === 'assistant' ? '' : state.streamingText,
    }));
    return messageId;
  },
  appendToken: (token) => {
    set((state) => ({
      streamingText: `${state.streamingText}${token}`,
      aiThinking: true,
      error: null,
    }));
  },
  finishStreaming: () => {
    const { streamingText } = get();
    const trimmed = streamingText.trim();

    set((state) => ({
      messages: trimmed
        ? [...state.messages, { id: crypto.randomUUID(), role: 'assistant', content: trimmed }]
        : state.messages,
      streamingText: '',
      aiThinking: false,
      error: null,
    }));
  },
  setError: (message) => {
    set((state) => ({
      messages: [...state.messages, { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${message}` }],
      streamingText: '',
      aiThinking: false,
      error: message,
    }));
  },
  reset: () => set(initialState),
}));
