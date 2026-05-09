// agent/agent.ts
import { complete, type Context, type Model } from '@mariozechner/pi-ai';
import * as dotenv from 'dotenv';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');
const MONOREPO_ROOT = join(__dirname, '../../..');

dotenv.config({ path: join(MONOREPO_ROOT, '.env') });

export function validateArgs(arg: string | undefined): string {
  if (!arg || arg.trim() === '') {
    throw new Error('Usage: node agent.js "project description"');
  }
  return arg.trim();
}

function resolveEnv(): Record<string, string> {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '',
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'glm-4.7',
  };
}

function buildModel(env: Record<string, string>): Model<'openai-completions'> {
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

function extractAssistantText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string' && block.text.length > 0)
    .map((block) => block.text ?? '')
    .join('');
}

function stripMarkdownFences(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

export async function runAgent(userPrompt: string): Promise<void> {
  const systemPromptPath = join(PROJECT_ROOT, 'agent/prompts/system.md');
  if (!existsSync(systemPromptPath)) {
    throw new Error(`System prompt not found: ${systemPromptPath}`);
  }
  const systemPrompt = await readFile(systemPromptPath, 'utf-8');
  const env = resolveEnv();

  if (!env.OPENAI_API_KEY) {
    throw new Error(
      'API key not configured. Set OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN in .env',
    );
  }

  console.log(`[agent] Starting session for: "${userPrompt}"`);
  console.log(`[agent] Model: ${env.OPENAI_MODEL} via ${env.OPENAI_BASE_URL}`);
  console.log('[agent] Runtime: pi-ai direct completion');

  const model = buildModel(env);
  const context: Context = {
    systemPrompt,
    messages: [{
      role: 'user',
      content: userPrompt,
      timestamp: Date.now(),
    }],
  };
  const message = await complete(model, context, {
    apiKey: env.OPENAI_API_KEY,
  });
  const output = stripMarkdownFences(extractAssistantText(message.content));

  if (message.stopReason === 'error' || message.stopReason === 'aborted') {
    throw new Error(message.errorMessage || output || 'Agent completion failed');
  }

  console.log(output);
  console.log('\n[agent] Session complete.');

  const outputPath = join(MONOREPO_ROOT, 'tasks.json');
  if (output) {
    await writeFile(outputPath, output, 'utf-8');
    console.log(`[agent] Output written to ${outputPath}`);
  } else {
    console.warn('[agent] Warning: No JSON output captured. tasks.json not updated.');
  }
}

const isMain = process.argv[1]
  && (process.argv[1].endsWith('agent.js') || process.argv[1].endsWith('agent.ts'));

if (isMain) {
  const rawArg = process.argv[2];
  let prompt: string;
  try {
    prompt = validateArgs(rawArg);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  runAgent(prompt).catch((err) => {
    console.error('[agent] Fatal error:', err.message);
    process.exit(1);
  });
}
