import { complete, stream, type AssistantMessage, type Context, type Model } from '@mariozechner/pi-ai';

export type PiOpenAIEnv = {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
};

export function buildPiOpenAICompletionsModel(env: PiOpenAIEnv): Model<'openai-completions'> {
  return {
    id: env.OPENAI_MODEL,
    name: env.OPENAI_MODEL,
    api: 'openai-completions',
    provider: 'gantt-openai-compatible',
    baseUrl: env.OPENAI_BASE_URL,
    reasoning: false,
    input: ['text'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 4096,
    compat: {
      supportsStore: false,
      supportsReasoningEffort: false,
    },
  };
}

export function extractTextFromAssistantContent(
  content: Array<{ type: string; text?: string }>,
): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string' && block.text.length > 0)
    .map((block) => block.text ?? '')
    .join('');
}

export async function completeTextPrompt(input: {
  env: PiOpenAIEnv;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  onTextDelta?: (delta: string, fullText: string) => Promise<void> | void;
}): Promise<string> {
  const model = buildPiOpenAICompletionsModel(input.env);
  const context: Context = {
    ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
    messages: [{
      role: 'user',
      content: input.prompt,
      timestamp: Date.now(),
    }],
  };
  if (!input.onTextDelta) {
    const message = await complete(model, context, {
      apiKey: input.env.OPENAI_API_KEY,
      maxTokens: input.maxTokens,
    });

    const content = extractTextFromAssistantContent(message.content);
    if (message.stopReason === 'error' || message.stopReason === 'aborted') {
      throw new Error(message.errorMessage || content || 'Model query failed');
    }

    if (!content.trim()) {
      throw new Error('Model query returned an empty response');
    }

    return content;
  }

  const eventStream = stream(model, context, {
    apiKey: input.env.OPENAI_API_KEY,
    maxTokens: input.maxTokens,
  });
  let streamedText = '';
  let finalMessage: AssistantMessage | null = null;

  for await (const event of eventStream) {
    if (event.type === 'text_delta') {
      streamedText += event.delta;
      await input.onTextDelta(event.delta, streamedText);
      continue;
    }

    if (event.type === 'done') {
      finalMessage = event.message;
      continue;
    }

    if (event.type === 'error') {
      const content = extractTextFromAssistantContent(event.error.content);
      throw new Error(event.error.errorMessage || content || 'Model query failed');
    }
  }

  const message = finalMessage ?? await eventStream.result();
  const content = extractTextFromAssistantContent(message.content);
  if (message.stopReason === 'error' || message.stopReason === 'aborted') {
    throw new Error(message.errorMessage || content || 'Model query failed');
  }

  if (!content.trim()) {
    throw new Error('Model query returned an empty response');
  }

  return content;
}
