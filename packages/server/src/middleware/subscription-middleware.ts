/**
 * Subscription enforcement middleware
 *
 * Runs AFTER authMiddleware (requires req.user.userId).
 * Enforces AI generation limits per D-06 (only on chat, not drag-to-edit)
 * and D-07 (1 message = 1 generation).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { BillingService } from '../services/billing-service.js';
import { isPlanActive } from '../services/plan-config.js';

const billingService = new BillingService();

export async function subscriptionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user?.userId;
  if (!userId) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  // Get subscription status
  const status = await billingService.getSubscriptionStatus(userId);

  // Check if subscription is active (D-05: strict enforcement)
  // Free plan is always active even without periodEnd
  if (!status.isActive && status.plan !== 'free') {
    // Plan expired — read-only mode
    reply.status(403).send({
      error: 'Подписка истекла. Продлите тариф для продолжения.',
      code: 'SUBSCRIPTION_EXPIRED',
      plan: status.plan,
      periodEnd: status.periodEnd,
    });
    return;
  }

  // Check AI generation limits (D-06: only on AI requests, D-07: 1 message = 1 generation)
  if (status.aiLimit !== -1 && status.aiUsed >= status.aiLimit) {
    reply.status(403).send({
      error: `Лимит AI-генераций исчерпан (${status.aiUsed}/${status.aiLimit}). Повысьте тариф для продолжения.`,
      code: 'AI_LIMIT_REACHED',
      aiUsed: status.aiUsed,
      aiLimit: status.aiLimit,
    });
    return;
  }
}

/**
 * Increment AI usage after successful chat message processing.
 * Called from the /api/chat handler after validation passes.
 */
export async function incrementAiUsage(userId: string): Promise<{ used: number; limit: number }> {
  return billingService.incrementAiUsage(userId);
}
