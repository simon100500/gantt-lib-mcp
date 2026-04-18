import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  requestContextId?: string | null;
  historyGroupId?: string | null;
}

interface ChatState {
  messages: ChatMessage[];
  streamingText: string;
  pendingAssistantMeta: {
    requestContextId?: string | null;
    historyGroupId?: string | null;
  } | null;
  aiThinking: boolean;
  error: string | null;
  addMessage: (message: Omit<ChatMessage, 'id'> & { id?: string }) => string;
  appendToken: (token: string) => void;
  finishStreaming: (meta?: {
    requestContextId?: string | null;
    historyGroupId?: string | null;
  }) => void;
  attachCheckpointToLatestUserMessage: (meta?: {
    requestContextId?: string | null;
    historyGroupId?: string | null;
  }) => void;
  replaceMessages: (messages: ChatMessage[]) => void;
  softDeleteFromMessageId: (messageId: string) => void;
  setError: (message: string) => void;
  reset: () => void;
}

const initialState = {
  messages: [] as ChatMessage[],
  streamingText: '',
  pendingAssistantMeta: null,
  aiThinking: false,
  error: null as string | null,
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,
  addMessage: ({ id, role, content, requestContextId, historyGroupId }) => {
    const messageId = id ?? crypto.randomUUID();
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: messageId,
          role,
          content,
          requestContextId: requestContextId ?? null,
          historyGroupId: historyGroupId ?? null,
        },
      ],
      error: null,
      aiThinking: role === 'user' ? true : false,
      streamingText: role === 'assistant' ? '' : state.streamingText,
      pendingAssistantMeta: role === 'assistant'
        ? null
        : state.pendingAssistantMeta,
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
  finishStreaming: (meta) => {
    const { streamingText, pendingAssistantMeta } = get();
    const trimmed = streamingText.trim();
    const resolvedMeta = meta ?? pendingAssistantMeta ?? undefined;

    set((state) => ({
      messages: trimmed
        ? [
            ...state.messages,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: trimmed,
              requestContextId: resolvedMeta?.requestContextId ?? null,
              historyGroupId: resolvedMeta?.historyGroupId ?? null,
            },
          ]
        : state.messages,
      streamingText: '',
      pendingAssistantMeta: null,
      aiThinking: false,
      error: null,
    }));
  },
  attachCheckpointToLatestUserMessage: (meta) => set((state) => {
    if (!meta?.historyGroupId && !meta?.requestContextId) {
      return state;
    }

    const nextMessages = [...state.messages];
    for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
      const message = nextMessages[index];
      if (message.role !== 'user') {
        continue;
      }

      nextMessages[index] = {
        ...message,
        requestContextId: meta.requestContextId ?? message.requestContextId ?? null,
        historyGroupId: meta.historyGroupId ?? message.historyGroupId ?? null,
      };
      return {
        ...state,
        messages: nextMessages,
      };
    }

    return state;
  }),
  replaceMessages: (messages) => set({
    messages,
    streamingText: '',
    pendingAssistantMeta: null,
    aiThinking: false,
    error: null,
  }),
  softDeleteFromMessageId: (messageId) => set((state) => {
    const anchorIndex = state.messages.findIndex((message) => message.id === messageId);
    if (anchorIndex === -1) {
      return state;
    }

    return {
      ...state,
      messages: state.messages.slice(0, anchorIndex),
      streamingText: '',
      pendingAssistantMeta: null,
      aiThinking: false,
      error: null,
    };
  }),
  setError: (message) => {
    set((state) => ({
      messages: [...state.messages, { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${message}` }],
      streamingText: '',
      pendingAssistantMeta: null,
      aiThinking: false,
      error: message,
    }));
  },
  reset: () => set(initialState),
}));
