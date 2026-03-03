// agent/agent.ts
import { query, isSDKResultMessage, isSDKAssistantMessage } from '@qwen-code/sdk';
import * as dotenv from 'dotenv';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Project root is one level up from agent/
const PROJECT_ROOT = join(__dirname, '..');

// Load .env from project root
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

/**
 * Validate CLI argument — exported for unit testing.
 * Throws with Usage message if arg is missing or empty.
 */
export function validateArgs(arg: string | undefined): string {
  if (!arg || arg.trim() === '') {
    throw new Error('Usage: node agent.js "project description"');
  }
  return arg.trim();
}

/**
 * Resolve env variables with fallback chain:
 * - OPENAI_API_KEY    → ANTHROPIC_AUTH_TOKEN
 * - OPENAI_BASE_URL   → https://api.z.ai/api/paas/v4/
 * - OPENAI_MODEL      → ANTHROPIC_DEFAULT_SONNET_MODEL → 'glm-4.7'
 */
function resolveEnv(): Record<string, string> {
  return {
    OPENAI_API_KEY:  process.env.OPENAI_API_KEY  ?? process.env.ANTHROPIC_AUTH_TOKEN  ?? '',
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
    OPENAI_MODEL:    process.env.OPENAI_MODEL    ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'glm-4.7',
  };
}

/**
 * Main agent run function — exported for integration testing.
 */
export async function runAgent(userPrompt: string): Promise<void> {
  // Load system prompt from file
  const systemPromptPath = join(PROJECT_ROOT, 'agent/prompts/system.md');
  if (!existsSync(systemPromptPath)) {
    throw new Error(`System prompt not found: ${systemPromptPath}`);
  }
  const systemPrompt = await readFile(systemPromptPath, 'utf-8');

  const env = resolveEnv();

  if (!env.OPENAI_API_KEY) {
    throw new Error(
      'API key not configured. Set OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN in .env'
    );
  }

  const mcpServerPath = join(PROJECT_ROOT, 'dist/index.js');
  if (!existsSync(mcpServerPath)) {
    throw new Error(
      `MCP server not compiled. Run: npm run build\nExpected: ${mcpServerPath}`
    );
  }

  console.log(`[agent] Starting session for: "${userPrompt}"`);
  console.log(`[agent] Model: ${env.OPENAI_MODEL} via ${env.OPENAI_BASE_URL}`);
  console.log(`[agent] MCP server: ${mcpServerPath}`);

  // The @qwen-code/sdk v0.1.5 query() signature:
  // query({ prompt, options }: { prompt: string; options?: QueryOptions }): Query
  const session = query({
    prompt: `${systemPrompt}\n\nUser request: ${userPrompt}`,
    options: {
      model: env.OPENAI_MODEL,
      cwd: PROJECT_ROOT,
      permissionMode: 'yolo',
      authType: 'openai',
      env,
      mcpServers: {
        gantt: {
          command: 'node',
          args: [mcpServerPath],
        },
      },
      maxSessionTurns: 30,
    },
  });

  let capturedJson: string | null = null;

  for await (const message of session) {
    if (isSDKAssistantMessage(message)) {
      // SDKAssistantMessage wraps APIAssistantMessage in .message
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text) {
          process.stdout.write(block.text);
          // Try to extract JSON from text output (agent may embed it)
          const jsonMatch = block.text.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            capturedJson = jsonMatch[1].trim();
          }
        }
      }
    }
    if (isSDKResultMessage(message)) {
      if (!message.is_error && message.result) {
        capturedJson = message.result;
      }
      console.log('\n[agent] Session complete.');
    }
  }

  // Write output
  const outputPath = join(PROJECT_ROOT, 'tasks.json');
  if (capturedJson) {
    await writeFile(outputPath, capturedJson, 'utf-8');
    console.log(`[agent] Output written to ${outputPath}`);
  } else {
    console.warn('[agent] Warning: No JSON output captured. tasks.json not updated.');
    console.warn('[agent] The agent may not have called export_tasks. Check session output above.');
  }
}

// CLI entry point — only runs when executed directly
// ESM equivalent of: if (require.main === module)
const isMain = process.argv[1] &&
  (process.argv[1].endsWith('agent.js') || process.argv[1].endsWith('agent.ts'));

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
