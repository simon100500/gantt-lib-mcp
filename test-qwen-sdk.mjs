/**
 * Test qwen-code SDK with a simple ping MCP tool to see if tool calls work
 */
import { query, isSDKResultMessage, isSDKAssistantMessage, isSDKPartialAssistantMessage } from '@qwen-code/sdk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { createServer } from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = process.env.OPENAI_BASE_URL;
const MODEL = process.env.OPENAI_MODEL;

console.log('=== Qwen SDK Test ===');
console.log('Base URL:', BASE_URL);
console.log('Model:   ', MODEL);
console.log('');

// Path to compiled MCP server
const mcpPath = join(__dirname, 'packages/mcp/dist/index.js');

const env = {
  OPENAI_API_KEY: API_KEY,
  OPENAI_BASE_URL: BASE_URL,
  OPENAI_MODEL: MODEL,
};

const prompt = 'Call the ping tool and tell me the result.';

console.log('Prompt:', prompt);
console.log('MCP path:', mcpPath);
console.log('');

const session = query({
  prompt,
  options: {
    authType: 'openai',
    model: MODEL,
    cwd: __dirname,
    permissionMode: 'yolo',
    includePartialMessages: true,
    env,
    mcpServers: {
      gantt: {
        command: 'node',
        args: [mcpPath],
        env: {
          DATABASE_URL: process.env.DATABASE_URL ?? '',
          PROJECT_ID: 'test-project',
        },
      },
    },
  },
});

let eventCount = 0;
let textSoFar = '';

try {
  for await (const event of session) {
    eventCount++;
    const type = event?.type ?? event?.event?.type ?? 'unknown';

    if (isSDKPartialAssistantMessage(event)) {
      const evt = event.event;
      if (evt.type === 'content_block_delta') {
        if (evt.delta.type === 'text_delta') {
          process.stdout.write(evt.delta.text);
          textSoFar += evt.delta.text;
        }
        if (evt.delta.type === 'thinking_delta') {
          process.stdout.write('[THINKING] ');
        }
      }
      continue;
    }

    if (isSDKAssistantMessage(event)) {
      console.log('\n[SDK AssistantMessage]', JSON.stringify(event.message?.content?.slice(0,2)));
      continue;
    }

    if (isSDKResultMessage(event)) {
      console.log('\n');
      console.log('=== SDK Result ===');
      console.log('is_error:', event.is_error);
      console.log('subtype: ', event.subtype);
      console.log('turns:   ', event.num_turns);
      console.log('result:  ', typeof event.result === 'string' ? event.result.slice(0, 300) : JSON.stringify(event.result)?.slice(0, 300));
      break;
    }

    // Log other events briefly
    console.log(`[event ${eventCount}] type=${type}`);
  }
} catch (err) {
  console.error('\nFATAL ERROR:', err.message);
  console.error(err.stack);
}

console.log('\nTotal events received:', eventCount);
