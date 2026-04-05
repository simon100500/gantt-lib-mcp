/**
 * TrialTriggerService — detects value events and determines trial trigger eligibility.
 *
 * Read-only checks: does NOT modify any state.
 * Checks that user has a meaningful project (tasks exist) and meets a trigger condition:
 *  - AI interactions >= 3, OR
 *  - Has a project with tasks (premium feature attempt detected client-side)
 */

import type { PrismaClient } from '@gantt/mcp/prisma';

export interface TriggerCheckResult {
  shouldOffer: boolean;
  triggerType?: 'premium_feature_attempt' | 'ai_interactions';
}

type TrialTriggerPrisma = Pick<PrismaClient, 'project' | 'usageCounter'>;

interface TrialTriggerDeps {
  prisma?: TrialTriggerPrisma;
}

export class TrialTriggerService {
  private prisma?: TrialTriggerPrisma;
  private readonly _providedPrisma: TrialTriggerPrisma | undefined;

  constructor(deps: TrialTriggerDeps = {}) {
    this._providedPrisma = deps.prisma;
  }

  private async getPrisma(): Promise<TrialTriggerPrisma> {
    if (this._providedPrisma) return this._providedPrisma;
    if (!this.prisma) this.prisma = await getDefaultTriggerPrisma();
    return this.prisma;
  }

  /**
   * Check whether the user should be offered a trial.
   * Returns { shouldOffer: true, triggerType } if eligible, { shouldOffer: false } otherwise.
   */
  async checkTriggerEligibility(userId: string): Promise<TriggerCheckResult> {
    const prisma = await this.getPrisma();

    // Must have at least 1 active project with tasks (graph created)
    const projectWithTasks = await prisma.project.findFirst({
      where: {
        userId,
        status: 'active',
        tasks: { some: {} },
      },
      select: { id: true },
    });

    if (!projectWithTasks) {
      return { shouldOffer: false };
    }

    // Trigger A: Check if user has >= 3 AI interactions
    const aiUsageCount = await prisma.usageCounter.aggregate({
      _sum: { usage: true },
      where: {
        userId,
        limitKey: 'ai_queries',
      },
    });

    const totalAiUsage = aiUsageCount._sum.usage ?? 0;
    if (totalAiUsage >= 3) {
      return { shouldOffer: true, triggerType: 'ai_interactions' };
    }

    // Trigger B: premium feature attempt is detected client-side.
    // The client sends triggerType='premium_feature_attempt' when showing the offer
    // after a constraint denial. Server validates that a project with tasks exists.
    return { shouldOffer: true, triggerType: 'premium_feature_attempt' };
  }
}

async function getDefaultTriggerPrisma(): Promise<TrialTriggerPrisma> {
  const { getPrisma } = await import('@gantt/mcp/prisma');
  return getPrisma();
}
