// agent/agent.ts
import {
  Agent,
  MCPServerStdio,
  OpenAIProvider,
  Runner,
  setOpenAIAPI,
} from '@openai/agents';
import * as dotenv from 'dotenv';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Package root: dist/agent/agent.js → up two levels → packages/mcp
const PROJECT_ROOT = join(__dirname, '../..');

// Load .env from monorepo root (3 levels up from dist/agent/)
const MONOREPO_ROOT = join(__dirname, '../../..');
dotenv.config({ path: join(MONOREPO_ROOT, '.env') });

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
 * Resolve env variables for OpenAI Agents JS.
 */
function resolveEnv(): Record<string, string> {
  return {
    OPENAI_API_KEY:  process.env.OPENAI_API_KEY  ?? process.env.ANTHROPIC_AUTH_TOKEN  ?? '',
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? '',
    OPENAI_MODEL:    process.env.OPENAI_MODEL    ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? '',
  };
}

/**
 * Main agent run function — exported for integration testing.
 */
export async function runAgent(userPrompt: string): Promise<void> {
  // Load system prompt from file
  // PROJECT_ROOT = packages/mcp/, system.md is at packages/mcp/agent/prompts/system.md
  const systemPromptPath = join(PROJECT_ROOT, 'agent/prompts/system.md');
  if (!existsSync(systemPromptPath)) {
    throw new Error(`System prompt not found: ${systemPromptPath}`);
  }
  const systemPrompt = await readFile(systemPromptPath, 'utf-8');

  const env = resolveEnv();

  if (!env.OPENAI_API_KEY) {
    throw new Error(
      'API key not configured. Set OPENAI_API_KEY in .env'
    );
  }
  if (!env.OPENAI_MODEL) {
    throw new Error('OPENAI_MODEL is required for OpenAI Agents JS.');
  }
  if (/^(glm|qwen)-/i.test(env.OPENAI_MODEL)) {
    throw new Error(`OPENAI_MODEL "${env.OPENAI_MODEL}" is not valid for OpenAI Agents JS.`);
  }

  // MCP server is at packages/mcp/dist/index.js
  const mcpServerPath = join(PROJECT_ROOT, 'dist/index.js');
  if (!existsSync(mcpServerPath)) {
    throw new Error(
      `MCP server not compiled. Run: npm run build:mcp\nExpected: ${mcpServerPath}`
    );
  }

  console.log(`[agent] Starting session for: "${userPrompt}"`);
  console.log(`[agent] Model: ${env.OPENAI_MODEL}`);
  console.log(`[agent] MCP server: ${mcpServerPath}`);

  setOpenAIAPI('chat_completions');
  const mcpServer = new MCPServerStdio({
    name: 'gantt',
    command: 'node',
    args: [mcpServerPath],
  });

  let capturedJson: string | null = null;

  await mcpServer.connect();
  try {
    const runner = new Runner({
      modelProvider: new OpenAIProvider({
        apiKey: env.OPENAI_API_KEY,
        ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
        useResponses: false,
      }),
      tracingDisabled: true,
      traceIncludeSensitiveData: false,
      model: env.OPENAI_MODEL,
    });
    const agent = new Agent({
      name: 'Gantt CLI Agent',
      instructions: systemPrompt,
      model: env.OPENAI_MODEL,
      mcpServers: [mcpServer],
    });
    const result = await runner.run(agent, `User request: ${userPrompt}`, { maxTurns: 30 });
    const output = typeof result.finalOutput === 'string' ? result.finalOutput : '';
    if (output) {
      process.stdout.write(output.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
      const jsonMatch = output.match(/```json\n([\s\S]*?)\n```/);
      capturedJson = jsonMatch ? jsonMatch[1].trim() : output;
    }
    console.log('\n[agent] Session complete.');
  } finally {
    await mcpServer.close();
  }

  // Write output to monorepo root
  const outputPath = join(MONOREPO_ROOT, 'tasks.json');
  if (capturedJson) {
    const cleanJson = capturedJson.replace(/^```\w*\n?/, '').replace(/\n?```\s*$/, '');
    await writeFile(outputPath, cleanJson, 'utf-8');
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
