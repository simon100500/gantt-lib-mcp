import { appendFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOG_DIR = join(__dirname, '../../../.planning/debug');
const LOG_PATH = join(LOG_DIR, 'server-agent.log');

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[max-depth]';
  if (typeof value === 'string') {
    return value.length > 4000 ? `${value.slice(0, 4000)}...[truncated ${value.length - 4000} chars]` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).slice(0, 50).map(([key, entryValue]) => [
        key,
        sanitize(entryValue, depth + 1),
      ]),
    );
  }
  return value;
}

export async function writeServerDebugLog(event: string, payload: Record<string, unknown> = {}): Promise<void> {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    source: 'server',
    event,
    payload: sanitize(payload),
  });

  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_PATH, `${line}\n`, 'utf8');
  } catch (error) {
    console.error('[debug-log] failed to write server log', error);
  }
}
