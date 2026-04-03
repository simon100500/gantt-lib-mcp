/**
 * Subscription enforcement middleware
 *
 * Runs AFTER authMiddleware (requires req.user.userId).
 * Enforces AI generation limits per D-06 (only on chat, not drag-to-edit)
 * and D-07 (1 message = 1 generation).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { BillingService } from '../services/billing-service.js';
import { createConstraintMiddleware } from './constraint-middleware.js';

const billingService = new BillingService();

export async function subscriptionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await runSubscriptionMiddleware(request, reply);
}

export async function runSubscriptionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  deps?: Parameters<typeof createConstraintMiddleware>[0],
): Promise<void> {
  const { requireActiveSubscriptionForMutation, requireTrackedLimit } = createConstraintMiddleware(deps);
  await requireActiveSubscriptionForMutation(request, reply);
  if (reply.sent) {
    return;
  }

  await requireTrackedLimit('ai_queries', {
    code: 'AI_LIMIT_REACHED',
    upgradeHint: 'Upgrade your plan to continue AI-assisted changes.',
  })(request, reply);
}

/**
 * Increment AI usage after successful chat message processing.
 * Called from the /api/chat handler after validation passes.
 */
export async function incrementAiUsage(userId: string): Promise<{ used: number; limit: number }> {
  return billingService.incrementAiUsage(userId);
}
