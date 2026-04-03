import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createConstraintMiddleware } from './constraint-middleware.js';
import { runSubscriptionMiddleware } from './subscription-middleware.js';

function createReplyStub() {
  const reply = {
    statusCode: 200,
    payload: undefined as unknown,
    sent: false,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(payload: unknown) {
      reply.payload = payload;
      reply.sent = true;
      return reply;
    },
  };

  return reply as unknown as FastifyReply & {
    statusCode: number;
    payload: unknown;
    sent: boolean;
  };
}

function createRequest(userId: string): FastifyRequest {
  return {
    user: {
      userId,
      email: 'user@example.com',
      projectId: 'project-1',
      sessionId: 'session-1',
    },
  } as FastifyRequest;
}

describe('constraint middleware helpers', () => {
  it('returns the structured tracked-limit denial payload', async () => {
    const reply = createReplyStub();
    const { requireTrackedLimit } = createConstraintMiddleware({
      constraintService: {
        async checkLimit() {
          return {
            allowed: false,
            reasonCode: 'limit_reached' as const,
            planId: 'start' as const,
            limitKey: 'projects' as const,
            limit: 3,
            usage: {
              planId: 'start' as const,
              limitKey: 'projects' as const,
              limit: 3,
              usageState: 'tracked' as const,
              period: 'current' as const,
              periodBucket: 'active_projects' as const,
              used: 3,
            },
            remaining: {
              planId: 'start' as const,
              limitKey: 'projects' as const,
              limit: 3,
              remainingState: 'tracked' as const,
              remaining: 0,
            },
          };
        },
      },
      billingService: {
        async getSubscriptionStatus() {
          return {
            plan: 'start' as const,
            periodEnd: '2026-04-30T00:00:00.000Z',
            aiUsed: 0,
            aiLimit: 10,
            isActive: true,
            planMeta: {
              id: 'start' as const,
              label: 'Start',
              pricing: { monthly: 1490, yearly: 12000 },
            },
            limits: {} as never,
            usage: {} as never,
          };
        },
      },
    });

    await requireTrackedLimit('projects', {
      code: 'PROJECT_LIMIT_REACHED',
      upgradeHint: 'Upgrade for more projects.',
    })(createRequest('user-1'), reply);

    assert.equal(reply.statusCode, 403);
    assert.deepEqual(reply.payload, {
      code: 'PROJECT_LIMIT_REACHED',
      limitKey: 'projects',
      reasonCode: 'limit_reached',
      remaining: 0,
      used: 3,
      limit: 3,
      plan: 'start',
      planLabel: 'Start',
      upgradeHint: 'Upgrade for more projects.',
    });
  });

  it('returns the expired-subscription denial without tracked remaining counters', async () => {
    const reply = createReplyStub();
    const { requireActiveSubscriptionForMutation } = createConstraintMiddleware({
      constraintService: {
        async checkLimit() {
          throw new Error('checkLimit should not run in this test');
        },
      },
      billingService: {
        async getSubscriptionStatus() {
          return {
            plan: 'team' as const,
            periodEnd: '2026-04-01T00:00:00.000Z',
            aiUsed: 50,
            aiLimit: 50,
            isActive: false,
            planMeta: {
              id: 'team' as const,
              label: 'Team',
              pricing: { monthly: 4990, yearly: 59880 },
            },
            limits: {} as never,
            usage: {} as never,
          };
        },
      },
    });

    await requireActiveSubscriptionForMutation(createRequest('user-2'), reply);

    assert.equal(reply.statusCode, 403);
    assert.deepEqual(reply.payload, {
      code: 'SUBSCRIPTION_EXPIRED',
      limitKey: null,
      reasonCode: 'subscription_expired',
      remaining: null,
      plan: 'team',
      planLabel: 'Team',
      upgradeHint: 'Renew your plan to keep editing projects.',
    });
  });
});

describe('subscriptionMiddleware', () => {
  it('blocks exhausted ai_queries before chat-side usage increment would run', async () => {
    const reply = createReplyStub();
    const request = createRequest('user-3');
    let incrementCalled = false;

    const runChatFlow = async () => {
      await runSubscriptionMiddleware(request, reply, {
        constraintService: {
          async checkLimit() {
            return {
              allowed: false,
              reasonCode: 'limit_reached' as const,
              planId: 'start' as const,
              limitKey: 'ai_queries' as const,
              limit: { period: 'daily' as const, value: 10 },
              usage: {
                planId: 'start' as const,
                limitKey: 'ai_queries' as const,
                limit: 10,
                usageState: 'tracked' as const,
                period: 'daily' as const,
                periodBucket: 'day:2026-04-03' as const,
                used: 10,
              },
              remaining: {
                planId: 'start' as const,
                limitKey: 'ai_queries' as const,
                limit: 10,
                remainingState: 'tracked' as const,
                remaining: 0,
              },
            };
          },
        },
        billingService: {
          async getSubscriptionStatus() {
            return {
              plan: 'start' as const,
              periodEnd: '2026-04-30T00:00:00.000Z',
              aiUsed: 10,
              aiLimit: 10,
              isActive: true,
              planMeta: {
                id: 'start' as const,
                label: 'Start',
                pricing: { monthly: 1490, yearly: 12000 },
              },
              limits: {} as never,
              usage: {} as never,
            };
          },
        },
      });

      if (!reply.sent) {
        incrementCalled = true;
      }
    };

    await runChatFlow();

    assert.equal(reply.statusCode, 403);
    assert.equal(incrementCalled, false);
    assert.deepEqual(reply.payload, {
      code: 'AI_LIMIT_REACHED',
      limitKey: 'ai_queries',
      reasonCode: 'limit_reached',
      remaining: 0,
      used: 10,
      limit: 10,
      plan: 'start',
      planLabel: 'Start',
      upgradeHint: 'Upgrade your plan to continue AI-assisted changes.',
    });
  });
});
