import type { FastifyInstance } from 'fastify';
import { getPrisma } from '@gantt/mcp/prisma';
import { PLAN_CATALOG, type BillingPeriod, type PlanId } from '@gantt/mcp/constraints';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireAdminAccess } from '../middleware/admin-middleware.js';
import { BillingService } from '../services/billing-service.js';

interface AdminUpdateSubscriptionBody {
  plan?: PlanId;
  period?: BillingPeriod;
  expireNow?: boolean;
  extendDays?: number;
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

  const [subscription, usageStatus, payments, projects] = await Promise.all([
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
      },
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
      usage: usageStatus.usage,
      remaining: usageStatus.remaining,
    },
    payments,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
      archivedAt: project.archivedAt?.toISOString() ?? null,
    })),
  };
}

export async function registerAdminApiRoutes(fastify: FastifyInstance): Promise<void> {
  const billingService = new BillingService();

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
}
