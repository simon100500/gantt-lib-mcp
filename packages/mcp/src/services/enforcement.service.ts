import { PLAN_CATALOG, type LimitKey, type PlanId } from '@gantt/mcp/constraints';
import { getPrisma } from '../prisma.js';
import type { MutationEnforcementPayload, NormalizedMutationResult } from '../types.js';

const DEFAULT_UPGRADE_HINT = 'Renew your plan to keep editing projects.';

type SubscriptionStatus = {
  plan: PlanId;
  planLabel: string;
  isActive: boolean;
};

type ProjectOwner = {
  projectId: string;
  userId: string;
};

type EnforcementDeps = {
  getProjectOwnerById?: (projectId: string) => Promise<ProjectOwner | null>;
  getSubscriptionStatus?: (userId: string) => Promise<SubscriptionStatus>;
  now?: () => Date;
};

export type MutationAccessDecision =
  | { allowed: true }
  | { allowed: false; enforcement: MutationEnforcementPayload };

export type EvaluateMutationAccessInput = {
  toolName: string;
  projectId?: string;
};

function planLabelFor(plan: PlanId): string {
  return PLAN_CATALOG[plan].label;
}

function isSubscriptionActive(periodEnd: Date | null | undefined, now: Date): boolean {
  return Boolean(periodEnd && periodEnd.getTime() > now.getTime());
}

async function loadProjectOwnerById(projectId: string): Promise<ProjectOwner | null> {
  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true },
  });

  if (!project) {
    return null;
  }

  return {
    projectId: project.id,
    userId: project.userId,
  };
}

function createSubscriptionStatusLoader(now: () => Date) {
  return async function loadSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
    const prisma = getPrisma();
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, periodEnd: true },
    });

    const plan = (subscription?.plan ?? 'free') as PlanId;
    return {
      plan,
      planLabel: planLabelFor(plan),
      isActive: plan === 'free' || isSubscriptionActive(subscription?.periodEnd ?? null, now()),
    };
  };
}

function buildExpiredPlanEnforcement(status: SubscriptionStatus): MutationEnforcementPayload {
  return {
    code: 'SUBSCRIPTION_EXPIRED',
    limitKey: null,
    remaining: null,
    plan: status.plan,
    planLabel: status.planLabel,
    upgradeHint: DEFAULT_UPGRADE_HINT,
  };
}

export function createLimitReachedRejection(
  result: NormalizedMutationResult,
  enforcement: MutationEnforcementPayload,
): NormalizedMutationResult {
  return {
    ...result,
    status: 'rejected',
    reason: 'limit_reached',
    enforcement,
  };
}

export function createEnforcementService(deps: EnforcementDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const getProjectOwnerById = deps.getProjectOwnerById ?? loadProjectOwnerById;
  const getSubscriptionStatus = deps.getSubscriptionStatus ?? createSubscriptionStatusLoader(now);

  return {
    async evaluateMutationAccess(input: EvaluateMutationAccessInput): Promise<MutationAccessDecision> {
      if (!input.projectId) {
        return { allowed: true };
      }

      const owner = await getProjectOwnerById(input.projectId);
      if (!owner?.userId) {
        return { allowed: true };
      }

      const status = await getSubscriptionStatus(owner.userId);
      if (status.plan === 'free' || status.isActive) {
        return { allowed: true };
      }

      return {
        allowed: false,
        enforcement: buildExpiredPlanEnforcement(status),
      };
    },
  };
}

export const enforcementService = createEnforcementService();

export type { MutationEnforcementPayload, SubscriptionStatus };
