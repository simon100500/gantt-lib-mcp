/**
 * Test SDK with inline MCP ping tool to see if tool calls work via openrouter
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

// Inline MCP server that handles ping_test
const mcpInlineScript = `
  const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
  process.stderr.write('[MCP] starting\\n');
  const s = new Server({ name: 'test', version: '0.1.0' }, { capabilities: { tools: {} } });
  s.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ name: 'ping_test', description: 'Returns pong - call this tool', inputSchema: { type: 'object', properties: {} } }]
  }));
  s.setRequestHandler(CallToolRequestSchema, async (req) => {
    process.stderr.write('[MCP] ping_test called\\n');
    return { content: [{ type: 'text', text: 'pong' }] };
  });
  const t = new StdioServerTransport();
  s.connect(t).then(() => process.stderr.write('[MCP] connected\\n'));
`;

const sdkCliPath = join(__dirname, 'node_modules/@qwen-code/sdk/dist/cli/cli.js');

const session = query({
  prompt: 'Call the ping_test tool and report what it returned.',
  options: {
    authType: 'openai',
    model: MODEL,
    cwd: __dirname,
    permissionMode: 'yolo',
    includePartialMessages: true,
    pathToQwenExecutable: `node:${sdkCliPath}`,
    env: {
      OPENAI_API_KEY: API_KEY,
      OPENAI_BASE_URL: BASE_URL,
      OPENAI_MODEL: MODEL,
    },
    mcpServers: {
      test: {
        command: 'node',
        args: ['-e', mcpInlineScript],
        env: {},
      },
    },
  },
});

let events = 0;
for await (const event of session) {
  events++;
  const elapsed = Date.now() - start;

  if (isSDKPartialAssistantMessage(event)) {
    const evt = event.event;
    if (evt?.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
      process.stdout.write(evt.delta.text);
    }
    continue;
  }

  if (isSDKAssistantMessage(event)) {
    const content = event.message?.content;
    const text = Array.isArray(content)
      ? content.map(c => c.text ?? '').join('')
      : String(content ?? '');
    if (text) console.log(`\n[${elapsed}ms] AssistantMessage: ${text.slice(0, 200)}`);
    continue;
  }

  if (isSDKResultMessage(event)) {
    console.log(`\n\n[${elapsed}ms] === SDK RESULT ===`);
    console.log('is_error:', event.is_error);
    console.log('turns:   ', event.num_turns);
    console.log('result:  ', String(event.result ?? '').slice(0, 300));
    if (event.is_error) console.log('error:', event.error);
    break;
  }

  // Other events
  const type = event?.type ?? event?.event?.type ?? JSON.stringify(Object.keys(event ?? {}));
  if (type !== 'system') console.log(`[${elapsed}ms] event: ${type}`);
}

console.log(`\nTotal events: ${events}, took ${Date.now() - start}ms`);
