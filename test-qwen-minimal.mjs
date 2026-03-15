/**
 * Minimal SDK test — WITHOUT MCP, just LLM call with inline tool
 * to isolate whether the issue is LLM response parsing or MCP
 */
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = process.env.OPENAI_BASE_URL;
const MODEL = process.env.OPENAI_MODEL;

console.log('URL:', BASE_URL, '| Model:', MODEL);

const { query, isSDKResultMessage, isSDKAssistantMessage, isSDKPartialAssistantMessage } = await import('@qwen-code/sdk');

const start = Date.now();

const session = query({
  prompt: 'Say hello in one word.',
  options: {
    authType: 'openai',
    model: MODEL,
    cwd: __dirname,
    permissionMode: 'yolo',
    includePartialMessages: false,
    env: {
      OPENAI_API_KEY: API_KEY,
      OPENAI_BASE_URL: BASE_URL,
      OPENAI_MODEL: MODEL,
    },
  },
});

let events = 0;
for await (const event of session) {
  events++;
  const elapsed = Date.now() - start;

  if (isSDKPartialAssistantMessage(event)) {
    process.stdout.write('.');
    continue;
  }
  if (isSDKAssistantMessage(event)) {
    const text = event.message?.content?.find?.(c => c.type === 'text')?.text ?? JSON.stringify(event.message?.content);
    console.log(`\n[${elapsed}ms] AssistantMessage: ${String(text).slice(0, 200)}`);
    continue;
  }
  if (isSDKResultMessage(event)) {
    console.log(`\n[${elapsed}ms] RESULT: turns=${event.num_turns} is_error=${event.is_error}`);
    console.log('result:', String(event.result).slice(0, 300));
    break;
  }
  console.log(`[${elapsed}ms] event type:`, event?.type ?? event?.event?.type ?? Object.keys(event ?? {}));
}

console.log(`\nTotal events: ${events}, took ${Date.now() - start}ms`);
