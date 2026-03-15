/**
 * Raw SSE test: make a direct chat/completions request with tool_calls
 * and capture every chunk as-is to see what the API returns.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = process.env.OPENAI_BASE_URL?.replace(/\/$/, '');
const MODEL = process.env.OPENAI_MODEL;

console.log('Base URL:', BASE_URL);
console.log('Model:   ', MODEL);
console.log('Key:     ', API_KEY?.slice(0, 20) + '...');
console.log('');

const body = {
  model: MODEL,
  stream: true,
  messages: [
    { role: 'user', content: 'Call the ping tool.' }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'ping',
        description: 'A simple ping',
        parameters: { type: 'object', properties: {} }
      }
    }
  ],
  tool_choice: 'required',
};

const LOG_PATH = join(__dirname, '.planning/debug/raw-sse-chunks.json');

console.log('Sending request to:', `${BASE_URL}/chat/completions`);
console.log('');

const resp = await fetch(`${BASE_URL}/chat/completions`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  },
  body: JSON.stringify(body),
});

console.log('Response status:', resp.status, resp.statusText);
console.log('Content-Type:', resp.headers.get('content-type'));
console.log('');

if (!resp.ok) {
  const text = await resp.text();
  console.error('Error response:', text);
  process.exit(1);
}

const chunks = [];
const reader = resp.body.getReader();
const decoder = new TextDecoder();

let buffer = '';
let chunkIndex = 0;

try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.trim()) continue;
      if (line === 'data: [DONE]') {
        console.log('[DONE]');
        continue;
      }
      if (line.startsWith('data: ')) {
        const raw = line.slice(6);
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch {}

        const entry = { index: chunkIndex++, raw, parsed };
        chunks.push(entry);

        // Print summary
        const choice = parsed?.choices?.[0];
        const delta = choice?.delta;
        const finish = choice?.finish_reason;
        const hasToolCall = !!(delta?.tool_calls?.length);
        const hasContent = !!(delta?.content);
        const hasReasoning = !!(delta?.reasoning_content || delta?.reasoning);

        console.log(`chunk[${entry.index}]  finish_reason=${finish ?? 'null'}  content=${hasContent}  tool_calls=${hasToolCall}  reasoning=${hasReasoning}`);
        if (hasToolCall) {
          for (const tc of delta.tool_calls) {
            console.log(`  toolCall[${tc.index}] id=${tc.id ?? '-'} name=${tc.function?.name ?? '-'} args=${tc.function?.arguments ?? ''}`);
          }
        }
        if (hasContent) console.log('  content:', delta.content?.slice(0, 100));
      }
    }
  }
} finally {
  reader.cancel().catch(() => {});
}

writeFileSync(LOG_PATH, JSON.stringify(chunks, null, 2), 'utf8');
console.log('');
console.log(`\nTotal chunks: ${chunks.length}`);
console.log(`Saved to: ${LOG_PATH}`);

// Summarize what happened
const finishChunk = chunks.find(c => c.parsed?.choices?.[0]?.finish_reason);
const toolCallChunks = chunks.filter(c => c.parsed?.choices?.[0]?.delta?.tool_calls?.length);
console.log('');
console.log('=== SUMMARY ===');
console.log('finish_reason chunk:', finishChunk?.parsed?.choices?.[0]?.finish_reason ?? 'NOT FOUND');
console.log('tool_call chunks:', toolCallChunks.length);
if (finishChunk) {
  const finishDelta = finishChunk.parsed.choices[0].delta;
  console.log('finish chunk has tool_calls:', !!(finishDelta?.tool_calls?.length));
  console.log('finish chunk has content:', !!(finishDelta?.content));
  console.log('finish chunk delta:', JSON.stringify(finishDelta));
}
