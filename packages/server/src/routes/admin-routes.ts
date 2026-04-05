import type { FastifyInstance } from 'fastify';
import { getPrisma } from '@gantt/mcp/prisma';
import { PLAN_CATALOG, type BillingPeriod, type PlanId } from '@gantt/mcp/constraints';
import { authService } from '@gantt/mcp/services';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireAdminAccess } from '../middleware/admin-middleware.js';
import { BillingService } from '../services/billing-service.js';
import { TrialService } from '../services/trial-service.js';

interface AdminUpdateSubscriptionBody {
  plan?: PlanId;
  period?: BillingPeriod;
  expireNow?: boolean;
  extendDays?: number;
  periodEnd?: string;
  aiQueriesUsed?: number;
}

function getAiPeriodBucket(plan: PlanId, now: Date): string {
  const aiLimit = PLAN_CATALOG[plan].limits.ai_queries;
  return aiLimit.period === 'lifetime' ? 'lifetime' : `day:${now.toISOString().slice(0, 10)}`;
}

function normalizePlan(value: unknown): PlanId | null {
  if (typeof value !== 'string') {
    return null;
  }

  return Object.hasOwn(PLAN_CATALOG, value) ? (value as PlanId) : null;
}

function normalizePeriod(value: unknown): BillingPeriod | null {
  return value === 'monthly' || value === 'yearly' ? value : null;
}

async function buildAdminUserSummary(user: { id: string; email: string; createdAt: Date }) {
  const prisma = getPrisma();
  const billingService = new BillingService();
  const [status, activeProjects, archivedProjects] = await Promise.all([
    billingService.getSubscriptionStatus(user.id),
    prisma.project.count({ where: { userId: user.id, status: 'active' } }),
    prisma.project.count({ where: { userId: user.id, status: 'archived' } }),
  ]);

  // Fetch trial fields — use any cast because worktree Prisma types may lag behind schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscription = await (prisma.subscription.findUnique as any)({
    where: { userId: user.id },
    select: { billingState: true, trialEndsAt: true },
  });

  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    subscription: {
      plan: status.plan,
      planLabel: status.planMeta.label,
      isActive: status.isActive,
      periodEnd: status.periodEnd,
    },
    billingState: subscription?.billingState ?? 'free',
    trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
    projects: {
      active: activeProjects,
      archived: archivedProjects,
    },
    usage: {
      aiQueriesUsed: status.usage.ai_queries.usageState === 'tracked' ? status.usage.ai_queries.used : 0,
      aiQueriesLimit: status.usage.ai_queries.usageState === 'tracked' ? status.usage.ai_queries.limit : null,
    },
  };
}

async function buildAdminUserDetails(userId: string) {
  const prisma = getPrisma();
  const billingService = new BillingService();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, createdAt: true },
  });

  if (!user) {
    return null;
  }

  const [subscription, usageStatus, payments, projects, subscriptionRecord, billingEvents] = await Promise.all([
    billingService.getSubscriptionStatus(user.id),
    billingService.getUsageStatus(user.id),
    billingService.getPaymentHistory(user.id),
    prisma.project.findMany({
      where: { userId: user.id, status: { not: 'deleted' } },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        archivedAt: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    // Fetch trial fields — any cast for worktree Prisma type lag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.subscription.findUnique as any)({
      where: { userId },
      select: {
        billingState: true,
        trialStartedAt: true,
        trialEndsAt: true,
        trialEndedAt: true,
        trialSource: true,
        trialConvertedAt: true,
        rolledBackAt: true,
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).billingEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    },
    subscription: {
      ...subscription,
      billingState: subscriptionRecord?.billingState ?? 'free',
      trial: {
        startedAt: subscriptionRecord?.trialStartedAt?.toISOString() ?? null,
        endsAt: subscriptionRecord?.trialEndsAt?.toISOString() ?? null,
        endedAt: subscriptionRecord?.trialEndedAt?.toISOString() ?? null,
        source: subscriptionRecord?.trialSource ?? null,
        convertedAt: subscriptionRecord?.trialConvertedAt?.toISOString() ?? null,
        rolledBackAt: subscriptionRecord?.rolledBackAt?.toISOString() ?? null,
      },
      usage: usageStatus.usage,
      remaining: usageStatus.remaining,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    billingEvents: (billingEvents as any[]).map((event: any) => ({
      id: event.id,
      actorType: event.actorType,
      actorId: event.actorId,
      previousState: event.previousState,
      newState: event.newState,
      reason: event.reason,
      createdAt: event.createdAt.toISOString(),
    })),
    payments,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
      archivedAt: project.archivedAt?.toISOString() ?? null,
      messageCount: project._count.messages,
    })),
  };
}

export async function registerAdminApiRoutes(fastify: FastifyInstance): Promise<void> {
  const billingService = new BillingService();

  fastify.get('/api/admin/access', { preHandler: [authMiddleware] }, async (req, reply) => {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { email: true },
    });

    const { isAdminEmail } = await import('../middleware/admin-middleware.js');

    return reply.send({
      isAdmin: isAdminEmail(user?.email),
    });
  });

  fastify.get('/api/admin/users', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const query = (req.query as { query?: string }).query?.trim();
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
      where: query ? {
        email: {
          contains: query,
          mode: 'insensitive',
        },
      } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    const items = await Promise.all(users.map((user) => buildAdminUserSummary(user)));
    return reply.send({ users: items });
  });

  fastify.get('/api/admin/users/:id/subscription', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const userId = (req.params as { id: string }).id;
    const details = await buildAdminUserDetails(userId);

    if (!details) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send(details);
  });

  fastify.post('/api/admin/users/:id/subscription', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const userId = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as AdminUpdateSubscriptionBody;
    const prisma = getPrisma();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const requestedPlan = body.plan === undefined ? null : normalizePlan(body.plan);
    if (body.plan !== undefined && !requestedPlan) {
      return reply.status(400).send({ error: 'Invalid plan' });
    }

    const requestedPeriod = body.period === undefined ? null : normalizePeriod(body.period);
    if (body.period !== undefined && !requestedPeriod) {
      return reply.status(400).send({ error: 'Invalid period' });
    }

    if (body.extendDays !== undefined && (!Number.isFinite(body.extendDays) || body.extendDays === 0)) {
      return reply.status(400).send({ error: 'extendDays must be a non-zero number' });
    }

    if (body.periodEnd !== undefined) {
      const parsed = new Date(body.periodEnd);
      if (Number.isNaN(parsed.getTime())) {
        return reply.status(400).send({ error: 'periodEnd must be a valid ISO date string' });
      }
    }

    if (body.aiQueriesUsed !== undefined && (!Number.isFinite(body.aiQueriesUsed) || body.aiQueriesUsed < 0)) {
      return reply.status(400).send({ error: 'aiQueriesUsed must be a non-negative number' });
    }

    if (requestedPlan) {
      if (requestedPlan === 'free') {
        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            plan: 'free',
            aiUsed: 0,
            periodStart: null,
            periodEnd: null,
          },
          update: {
            plan: 'free',
            aiUsed: 0,
            periodStart: null,
            periodEnd: null,
          },
        });
      } else {
        await billingService.applyPlan(userId, requestedPlan, requestedPeriod ?? 'monthly');
      }
    }

    if (body.expireNow) {
      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          plan: requestedPlan ?? 'free',
          aiUsed: 0,
          periodEnd: new Date(Date.now() - 1000),
        },
        update: {
          periodEnd: new Date(Date.now() - 1000),
        },
      });
    }

    if (body.extendDays !== undefined) {
      const current = await billingService.getOrCreateSubscription(userId);
      const baseDate = current.periodEnd && current.periodEnd.getTime() > Date.now()
        ? current.periodEnd
        : new Date();
      const nextPeriodEnd = new Date(baseDate.getTime() + body.extendDays * 24 * 60 * 60 * 1000);

      await prisma.subscription.update({
        where: { userId },
        data: {
          periodEnd: nextPeriodEnd,
          periodStart: current.periodStart ?? new Date(),
        },
      });
    }

    if (body.periodEnd !== undefined) {
      const targetDate = new Date(body.periodEnd);
      const current = await billingService.getOrCreateSubscription(userId);
      await prisma.subscription.update({
        where: { userId },
        data: {
          periodEnd: targetDate,
          periodStart: current.periodStart ?? new Date(),
        },
      });
    }

    if (body.aiQueriesUsed !== undefined) {
      const currentSubscription = await billingService.getOrCreateSubscription(userId);
      const plan = (currentSubscription.plan ?? 'free') as PlanId;
      const periodBucket = getAiPeriodBucket(plan, new Date());
      const usageValue = Math.max(0, Math.floor(body.aiQueriesUsed));

      await prisma.usageCounter.upsert({
        where: {
          userId_limitKey_periodBucket: {
            userId,
            limitKey: 'ai_queries',
            periodBucket,
          },
        },
        create: {
          userId,
          limitKey: 'ai_queries',
          periodBucket,
          usage: usageValue,
        },
        update: {
          usage: usageValue,
        },
      });

      await prisma.subscription.update({
        where: { userId },
        data: {
          aiUsed: usageValue,
        },
      });
    }

    const details = await buildAdminUserDetails(userId);
    return reply.send(details);
  });

  // Trial management routes
  const trialService = new TrialService();

  fastify.post('/api/admin/users/:id/trial/start', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const userId = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as { durationDays?: number; reason?: string };
    const adminUserId = req.user!.userId;

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    try {
      await trialService.startTrial(userId, {
        source: 'admin',
        durationDays: body.durationDays ?? 14,
        actorId: adminUserId,
        reason: body.reason,
      });
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Trial start failed' });
    }

    const details = await buildAdminUserDetails(userId);
    return reply.send(details);
  });

  fastify.post('/api/admin/users/:id/trial/extend', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const userId = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as { days: number; reason?: string };
    const adminUserId = req.user!.userId;

    if (!Number.isFinite(body.days) || body.days <= 0) {
      return reply.status(400).send({ error: 'days must be a positive number' });
    }

    try {
      await trialService.extendTrial(userId, body.days, {
        actorId: adminUserId,
        reason: body.reason,
      });
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Trial extend failed' });
    }

    const details = await buildAdminUserDetails(userId);
    return reply.send(details);
  });

  fastify.post('/api/admin/users/:id/trial/end', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const userId = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as { reason?: string };
    const adminUserId = req.user!.userId;

    try {
      await trialService.endTrialNow(userId, {
        actorId: adminUserId,
        reason: body.reason,
      });
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Trial end failed' });
    }

    const details = await buildAdminUserDetails(userId);
    return reply.send(details);
  });

  fastify.post('/api/admin/users/:id/trial/rollback', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const userId = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as { reason?: string };
    const adminUserId = req.user!.userId;

    try {
      const result = await trialService.rollbackTrialToFree(userId, {
        actorId: adminUserId,
        reason: body.reason,
      });
      return reply.send({ overLimitProjects: result.overLimitProjects });
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Trial rollback failed' });
    }
  });

  fastify.post('/api/admin/users/:id/trial/reset', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const userId = (req.params as { id: string }).id;
    const adminUserId = req.user!.userId;

    try {
      const prisma = getPrisma();
      await (prisma.subscription.update as any)({
        where: { userId },
        data: {
          billingState: 'free',
          trialStartedAt: null,
          trialEndsAt: null,
          trialEndedAt: null,
          trialSource: null,
          trialConvertedAt: null,
          rolledBackAt: null,
        },
      });
      const details = await buildAdminUserDetails(userId);
      return reply.send(details);
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Trial reset failed' });
    }
  });

  fastify.post('/api/admin/users/:id/trial/convert', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const userId = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as { paidPlan: string; period: string; reason?: string };
    const adminUserId = req.user!.userId;

    const validPlans = ['start', 'team', 'enterprise'];
    if (!validPlans.includes(body.paidPlan)) {
      return reply.status(400).send({ error: 'paidPlan must be one of: start, team, enterprise' });
    }

    if (body.period !== 'monthly' && body.period !== 'yearly') {
      return reply.status(400).send({ error: 'period must be monthly or yearly' });
    }

    try {
      await trialService.convertTrialToPaid(userId, {
        paidPlan: body.paidPlan as 'start' | 'team' | 'enterprise',
        period: body.period as 'monthly' | 'yearly',
        actorId: adminUserId,
        reason: body.reason,
      });
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Trial conversion failed' });
    }

    const details = await buildAdminUserDetails(userId);
    return reply.send(details);
  });

  fastify.post('/api/admin/projects/:id/share', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const projectId = (req.params as { id: string }).id;
    const prisma = getPrisma();
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        status: { not: 'deleted' },
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const shareLink = await authService.createShareLink(projectId);
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
    const host = req.headers.host ?? 'localhost:3000';
    const origin = req.headers.origin ?? `${proto}://${host}`;
    const url = `${origin}/?share=${encodeURIComponent(shareLink.id)}`;

    return reply.send({
      token: shareLink.id,
      url,
    });
  });

  fastify.get('/api/admin/projects/:id/messages', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const projectId = (req.params as { id: string }).id;
    const prisma = getPrisma();
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        status: { not: 'deleted' },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const messages = await prisma.message.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    return reply.send({
      project: {
        id: project.id,
        name: project.name,
      },
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
    });
  });
}
