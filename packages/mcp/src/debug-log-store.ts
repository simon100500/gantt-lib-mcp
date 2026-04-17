import { appendFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Prisma } from '../dist/prisma-client/index.js';
import { getPrisma } from './prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FALLBACK_LOG_DIR = join(__dirname, '../../../.planning/debug');
const FALLBACK_LOG_PATH = join(FALLBACK_LOG_DIR, 'agent-debug.log');

export type DebugLogSource = 'server' | 'mcp';

export type DebugLogInput = {
  source: DebugLogSource;
  event: string;
  payload?: Record<string, unknown>;
  userId?: string;
  projectId?: string;
  sessionId?: string;
  runId?: string;
  attempt?: number;
  tool?: string;
  toolUseId?: string;
  aiMutationSource?: string;
};

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

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAttempt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

async function resolveUserId(
  explicitUserId: string | undefined,
  sessionId: string | undefined,
  projectId: string | undefined,
): Promise<string | undefined> {
  const prisma = getPrisma();

  if (explicitUserId) {
    const user = await prisma.user.findUnique({
      where: { id: explicitUserId },
      select: { id: true },
    });
    if (user?.id) return user.id;
  }

  if (sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (session?.userId) return session.userId;
  }

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    if (project?.userId) return project.userId;
  }

  return undefined;
}

async function resolveProjectId(projectId: string | undefined): Promise<string | undefined> {
  if (!projectId) return undefined;

  const project = await getPrisma().project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  return project?.id;
}

async function resolveSessionId(sessionId: string | undefined): Promise<string | undefined> {
  if (!sessionId) return undefined;

  const session = await getPrisma().session.findUnique({
    where: { id: sessionId },
    select: { id: true },
  });

  return session?.id;
}

async function writeFallbackLog(record: Record<string, unknown>): Promise<void> {
  const line = JSON.stringify(record);
  try {
    await mkdir(FALLBACK_LOG_DIR, { recursive: true });
    await appendFile(FALLBACK_LOG_PATH, `${line}\n`, 'utf8');
  } catch (error) {
    console.error('[debug-log] failed to write fallback log', error);
  }
}

export async function writeDebugLog(input: DebugLogInput): Promise<void> {
  const payload = sanitize(input.payload ?? {}) as Prisma.InputJsonValue;
  const sessionId = await resolveSessionId(normalizeString(input.sessionId));
  const projectId = await resolveProjectId(normalizeString(input.projectId));
  const userId = await resolveUserId(normalizeString(input.userId), sessionId, projectId);
  const runId = normalizeString(input.runId);
  const tool = normalizeString(input.tool);
  const toolUseId = normalizeString(input.toolUseId);
  const aiMutationSource = normalizeString(input.aiMutationSource);
  const attempt = normalizeAttempt(input.attempt);

  const record = {
    ts: new Date().toISOString(),
    source: input.source,
    event: input.event,
    userId,
    projectId,
    sessionId,
    runId,
    attempt,
    tool,
    toolUseId,
    aiMutationSource,
    payload,
  };

  try {
    await ((getPrisma() as any).agentDebugLog.create({
      data: {
        source: input.source,
        event: input.event,
        userId,
        projectId,
        sessionId,
        runId,
        attempt,
        tool,
        toolUseId,
        aiMutationSource,
        payload,
      },
    }) as Promise<unknown>);
  } catch (error) {
    console.error('[debug-log] failed to write db log, falling back to file', error);
    await writeFallbackLog(record);
  }
}
