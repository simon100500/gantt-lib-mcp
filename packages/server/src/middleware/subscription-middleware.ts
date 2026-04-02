/**
 * Subscription enforcement middleware
 *
 * Runs AFTER authMiddleware (requires req.user.userId).
 * Enforces AI generation limits per D-06 (only on chat, not drag-to-edit)
 * and D-07 (1 message = 1 generation).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { BillingService } from '../services/billing-service.js';
import { ConstraintService } from '../services/constraint-service.js';

const billingService = new BillingService();
const constraintService = new ConstraintService();

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

  const aiCheck = await constraintService.checkLimit(userId, 'ai_queries');
  if (!aiCheck.allowed) {
    const aiUsed = aiCheck.usage.usageState === 'tracked' ? aiCheck.usage.used : 0;
    const aiLimit = aiCheck.usage.usageState === 'tracked' ? aiCheck.usage.limit : 0;

    reply.status(403).send({
      error: `Лимит AI-генераций исчерпан (${aiUsed}/${aiLimit}). Повысьте тариф для продолжения.`,
      code: 'AI_LIMIT_REACHED',
      aiUsed,
      aiLimit,
      reasonCode: aiCheck.reasonCode,
      plan: aiCheck.planId,
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
