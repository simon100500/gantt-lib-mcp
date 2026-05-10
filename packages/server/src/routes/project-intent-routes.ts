import type { FastifyInstance, FastifyReply } from 'fastify';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { authMiddleware } from '../middleware/auth-middleware.js';

const DEFAULT_INTENT_TTL_HOURS = 24;
const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 4000;
const MAX_SOURCE_LENGTH = 100;
const MAX_TEMPLATE_SLUG_LENGTH = 200;
const DEFAULT_PUBLIC_SITE_ORIGINS = [
  'https://getgantt.ru',
  'https://www.getgantt.ru',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getAllowedSiteOrigins(): string[] {
  const rawOrigins = [
    process.env.SITE_ORIGIN,
    process.env.SITE_URL,
    process.env.PUBLIC_SITE_URL,
    process.env.CORS_SITE_ORIGIN,
  ]
    .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...DEFAULT_PUBLIC_SITE_ORIGINS, ...rawOrigins])];
}

function applyPublicIntentCors(reply: FastifyReply, origin: string | undefined): void {
  const allowedOrigins = getAllowedSiteOrigins();
  if (!origin || !allowedOrigins.includes(origin)) {
    return;
  }

  reply.header('Access-Control-Allow-Origin', origin);
  reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
  reply.header('Vary', 'Origin');
}

function isIntentUnavailable(intent: { expiresAt: Date; consumedAt: Date | null }): boolean {
  return Boolean(intent.consumedAt) || intent.expiresAt.getTime() <= Date.now();
}

function getIntentUnavailableMessage(intent: { expiresAt: Date; consumedAt: Date | null }): string {
  if (intent.consumedAt) {
    return 'Intent already consumed';
  }

  return 'Intent expired';
}

export async function registerProjectIntentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.options('/api/public/project-intents', async (req, reply) => {
    applyPublicIntentCors(reply, typeof req.headers.origin === 'string' ? req.headers.origin : undefined);
    return reply.status(204).send();
  });

  fastify.post('/api/public/project-intents', async (req, reply) => {
    applyPublicIntentCors(reply, typeof req.headers.origin === 'string' ? req.headers.origin : undefined);

    const body = (req.body ?? {}) as { text?: unknown; source?: unknown; templateSlug?: unknown };
    const source = asNonEmptyString(body.source);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const templateSlug = typeof body.templateSlug === 'string' ? body.templateSlug.trim() : '';

    if (!source) {
      return reply.status(400).send({ reason: 'validation_error', error: 'source required' });
    }

    if (source.length > MAX_SOURCE_LENGTH) {
      return reply.status(400).send({ reason: 'validation_error', error: `source must be at most ${MAX_SOURCE_LENGTH} characters` });
    }

    if (text.length < MIN_TEXT_LENGTH) {
      return reply.status(400).send({ reason: 'validation_error', error: `text must be at least ${MIN_TEXT_LENGTH} characters` });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return reply.status(400).send({ reason: 'validation_error', error: `text must be at most ${MAX_TEXT_LENGTH} characters` });
    }

    if (templateSlug.length > MAX_TEMPLATE_SLUG_LENGTH) {
      return reply.status(400).send({ reason: 'validation_error', error: `templateSlug must be at most ${MAX_TEMPLATE_SLUG_LENGTH} characters` });
    }

    const prisma = getPrisma() as any;
    const intent = await prisma.projectCreationIntent.create({
      data: {
        source,
        text,
        templateSlug: templateSlug || null,
        expiresAt: new Date(Date.now() + DEFAULT_INTENT_TTL_HOURS * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    return reply.status(201).send({ intentId: intent.id });
  });

  fastify.get('/api/project-intents/:intentId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const intentId = asNonEmptyString((req.params as { intentId?: unknown }).intentId);
    if (!intentId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'intentId required' });
    }

    const prisma = getPrisma() as any;
    const intent = await prisma.projectCreationIntent.findUnique({
      where: { id: intentId },
    });

    if (!intent) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (intent.userId && intent.userId !== req.user!.userId) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (isIntentUnavailable(intent)) {
      return reply.status(410).send({ reason: 'expired', error: getIntentUnavailableMessage(intent) });
    }

    const boundIntent = intent.userId
      ? intent
      : await prisma.projectCreationIntent.update({
          where: { id: intent.id },
          data: { userId: req.user!.userId },
        });

    return reply.send({
      id: boundIntent.id,
      text: boundIntent.text,
      source: boundIntent.source,
      templateSlug: boundIntent.templateSlug,
      createdAt: boundIntent.createdAt,
      expiresAt: boundIntent.expiresAt,
      consumedAt: boundIntent.consumedAt,
    });
  });

  fastify.post('/api/project-intents/:intentId/consume', { preHandler: [authMiddleware] }, async (req, reply) => {
    const intentId = asNonEmptyString((req.params as { intentId?: unknown }).intentId);
    if (!intentId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'intentId required' });
    }

    const prisma = getPrisma() as any;
    const intent = await prisma.projectCreationIntent.findUnique({
      where: { id: intentId },
    });

    if (!intent) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (intent.userId && intent.userId !== req.user!.userId) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (isIntentUnavailable(intent)) {
      return reply.status(410).send({ reason: 'expired', error: getIntentUnavailableMessage(intent) });
    }

    await prisma.projectCreationIntent.update({
      where: { id: intent.id },
      data: {
        userId: intent.userId ?? req.user!.userId,
        consumedAt: new Date(),
      },
    });

    return reply.send({ ok: true });
  });
}
