import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LimitKey, PlanId } from '@gantt/mcp/constraints';
import { BillingService, type BillingSubscriptionStatus } from '../services/billing-service.js';
import { ConstraintService, type ConstraintCheckResult } from '../services/constraint-service.js';
import { resolveGroupAccess, resolveProjectAccess } from '../access-control.js';

type ConstraintMiddlewareDeps = {
  billingService?: Pick<BillingService, 'getSubscriptionStatus'>;
  constraintService?: Pick<ConstraintService, 'checkLimit'>;
};

type TrackedLimitOptions = {
  code: string;
  upgradeHint: string;
};

type FeatureGateOptions = {
  code: string;
  upgradeHint: string;
};

type DenialPayload = {
  code: string;
  limitKey: LimitKey | null;
  reasonCode: ConstraintCheckResult['reasonCode'] | 'subscription_expired';
  remaining: number | 'unlimited' | null;
  plan: PlanId;
  planLabel: string;
  upgradeHint: string;
  used?: number;
  limit?: number | 'unlimited';
};

const defaultBillingService = new BillingService();
const defaultConstraintService = new ConstraintService();

async function resolveConstraintUserId(request: FastifyRequest): Promise<string | null> {
  const userId = request.user?.userId;
  if (!userId) {
    return null;
  }

  const body = request.body as { groupId?: unknown } | undefined;
  if (typeof body?.groupId === 'string' && body.groupId.trim()) {
    const groupAccess = await resolveGroupAccess(userId, body.groupId.trim());
    return groupAccess?.billingUserId ?? userId;
  }

  const params = request.params as { id?: unknown } | undefined;
  if (request.url?.includes('/api/project-groups/') && typeof params?.id === 'string' && params.id.trim()) {
    const groupAccess = await resolveGroupAccess(userId, params.id.trim());
    return groupAccess?.billingUserId ?? userId;
  }

  const projectId = request.user?.projectId;
  if (projectId) {
    const projectAccess = request.projectAccess ?? await resolveProjectAccess(userId, projectId);
    return projectAccess?.billingUserId ?? userId;
  }

  return userId;
}

function sendDenial(reply: FastifyReply, payload: DenialPayload): void {
  reply.status(403).send(payload);
}

function buildExpiredSubscriptionPayload(
  status: BillingSubscriptionStatus,
  upgradeHint: string,
): DenialPayload {
  return {
    code: 'SUBSCRIPTION_EXPIRED',
    limitKey: null,
    reasonCode: 'subscription_expired',
    remaining: null,
    plan: status.plan,
    planLabel: status.planMeta.label,
    upgradeHint,
  };
}

function buildTrackedLimitPayload(
  result: ConstraintCheckResult,
  status: BillingSubscriptionStatus,
  options: TrackedLimitOptions,
): DenialPayload {
  const payload: DenialPayload = {
    code: options.code,
    limitKey: result.limitKey,
    reasonCode: result.reasonCode,
    remaining: result.remaining.remaining,
    plan: status.plan,
    planLabel: status.planMeta.label,
    upgradeHint: options.upgradeHint,
  };

  if (result.usage.usageState === 'tracked') {
    payload.used = result.usage.used;
  }

  if (result.remaining.remainingState === 'tracked' || result.remaining.remainingState === 'unlimited') {
    payload.limit = result.remaining.limit;
  }

  return payload;
}

export function createConstraintMiddleware(deps: ConstraintMiddlewareDeps = {}) {
  const billingService = deps.billingService ?? defaultBillingService;
  const constraintService = deps.constraintService ?? defaultConstraintService;

  async function requireActiveSubscriptionForMutation(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = await resolveConstraintUserId(request);
    if (!userId) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    const status = await billingService.getSubscriptionStatus(userId);
    if (status.isActive || status.plan === 'free') {
      return;
    }

    sendDenial(reply, buildExpiredSubscriptionPayload(
      status,
      'Renew your plan to keep editing projects.',
    ));
  }

  function requireTrackedLimit(limitKey: LimitKey, options: TrackedLimitOptions) {
    return async function trackedLimitGuard(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      const userId = await resolveConstraintUserId(request);
      if (!userId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const [status, result] = await Promise.all([
        billingService.getSubscriptionStatus(userId),
        constraintService.checkLimit(userId, limitKey),
      ]);

      if (result.allowed) {
        return;
      }

      sendDenial(reply, buildTrackedLimitPayload(result, status, options));
    };
  }

  function requireFeatureGate(limitKey: LimitKey, options: FeatureGateOptions) {
    return async function featureGateGuard(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      const userId = await resolveConstraintUserId(request);
      if (!userId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const [status, result] = await Promise.all([
        billingService.getSubscriptionStatus(userId),
        constraintService.checkLimit(userId, limitKey),
      ]);

      if (result.allowed) {
        return;
      }

      const payload: DenialPayload = {
        code: options.code,
        limitKey: result.limitKey,
        reasonCode: result.reasonCode,
        remaining: result.remaining.remaining,
        plan: status.plan,
        planLabel: status.planMeta.label,
        upgradeHint: options.upgradeHint,
      };

      sendDenial(reply, payload);
    };
  }

  return {
    requireActiveSubscriptionForMutation,
    requireTrackedLimit,
    requireFeatureGate,
  };
}

export const { requireActiveSubscriptionForMutation, requireTrackedLimit, requireFeatureGate } = createConstraintMiddleware();
