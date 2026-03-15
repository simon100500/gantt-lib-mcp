/**
 * Trace exactly what convertOpenAIChunkToGemini produces from raw SSE chunks
 */
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = process.env.OPENAI_BASE_URL?.replace(/\/$/, '');
const MODEL = process.env.OPENAI_MODEL;

// Read the SDK to find and patch the relevant classes
const sdkPath = join(__dirname, 'node_modules/@qwen-code/sdk/dist/cli/cli.js');
const sdkCode = readFileSync(sdkPath, 'utf8');

// Patch fetch to log AI requests/responses AND trace convertOpenAIChunkToGemini
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  if (url.includes('openrouter') || url.includes('openai') || url.includes('routerai') || url.includes('z.ai')) {
    let reqBody = null;
    try { reqBody = JSON.parse(init?.body); } catch {}
    console.log('\n=== HTTP REQUEST ===');
    console.log('URL:', url);
    console.log('Model:', reqBody?.model);
    console.log('Messages:', reqBody?.messages?.length);
    console.log('Tools:', reqBody?.tools?.map(t => t.function?.name));
    console.log('Stream:', reqBody?.stream);

    const resp = await originalFetch(input, init);
    console.log('\n=== HTTP RESPONSE ===');
    console.log('Status:', resp.status);
    console.log('Content-Type:', resp.headers.get('content-type'));

    if (resp.body && resp.headers.get('content-type')?.includes('stream')) {
      const [body1, body2] = resp.body.tee();

      // Read body2 to capture chunks
      (async () => {
        const reader = body2.getReader();
        const dec = new TextDecoder();
        let buf = '';
        let i = 0;
        try {
          while (i < 20) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
              if (!line.trim() || line === 'data: [DONE]') continue;
              if (line.startsWith('data: ')) {
                try {
                  const chunk = JSON.parse(line.slice(6));
                  const c = chunk.choices?.[0];
                  const hasToolCall = !!(c?.delta?.tool_calls?.length);
                  const hasContent = !!(c?.delta?.content);
                  const finishReason = c?.finish_reason;
                  console.log(`  RAW chunk[${i}] finish=${finishReason} tool_calls=${hasToolCall} content=${hasContent} delta.content=${JSON.stringify(c?.delta?.content)}`);
                  if (hasToolCall) {
                    for (const tc of c.delta.tool_calls) {
                      console.log(`    TC[${tc.index}] id=${tc.id} name=${tc.function?.name} args=${JSON.stringify(tc.function?.arguments)}`);
                    }
                  }
                  i++;
                } catch {}
              }
            }
          }
        } catch {}
        reader.cancel().catch(() => {});
      })();

      return new Response(body1, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
    }

    return resp;
  }

  return originalFetch(input, init);
};

// Now import and run SDK
const { query, isSDKResultMessage, isSDKAssistantMessage, isSDKPartialAssistantMessage } = await import('@qwen-code/sdk');

const mcpPath = join(__dirname, 'packages/mcp/dist/index.js');
const env = {
  OPENAI_API_KEY: API_KEY,
  OPENAI_BASE_URL: BASE_URL,
  OPENAI_MODEL: MODEL,
};

console.log('\n=== RUNNING SDK ===');
const session = query({
  prompt: 'Call the ping tool.',
  options: {
    authType: 'openai',
    model: MODEL,
    cwd: __dirname,
    permissionMode: 'yolo',
    includePartialMessages: false,
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

for await (const event of session) {
  if (isSDKResultMessage(event)) {
    console.log('\n=== SDK RESULT ===');
    console.log('is_error:', event.is_error);
    console.log('turns:   ', event.num_turns);
    console.log('result:  ', String(event.result).slice(0, 300));
    if (event.is_error) console.log('error:', event.error);
    break;
  }
  if (isSDKAssistantMessage(event)) {
    console.log('\n[AssistantMsg]', JSON.stringify(event.message?.content)?.slice(0, 200));
  }
}
