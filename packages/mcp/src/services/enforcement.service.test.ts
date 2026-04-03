import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { NormalizedMutationResult } from '../types.js';
import { createEnforcementService, createLimitReachedRejection } from './enforcement.service.js';

function createRejectedResult(
  partial: Partial<NormalizedMutationResult> = {},
): NormalizedMutationResult {
  return {
    status: 'rejected',
    baseVersion: 12,
    changedTaskIds: [],
    changedTasks: [],
    changedDependencyIds: [],
    conflicts: [],
    ...partial,
  };
}

describe('MCP enforcement service', () => {
  it('creates a typed limit_reached rejection payload with exact tariff keys', () => {
    const payload = createLimitReachedRejection(
      createRejectedResult(),
      {
        code: 'SUBSCRIPTION_EXPIRED',
        limitKey: 'ai_queries',
        remaining: 0,
        plan: 'team',
        planLabel: 'Team',
        upgradeHint: 'Renew to resume mutations.',
      },
    );

    assert.equal(payload.reason, 'limit_reached');
    assert.deepEqual(payload.enforcement, {
      code: 'SUBSCRIPTION_EXPIRED',
      limitKey: 'ai_queries',
      remaining: 0,
      plan: 'team',
      planLabel: 'Team',
      upgradeHint: 'Renew to resume mutations.',
    });
  });

  it('resolves project ownership before checking subscription status for mutation tools', async () => {
    const calls: string[] = [];
    const service = createEnforcementService({
      getProjectOwnerById: async (projectId) => {
        calls.push(`project:${projectId}`);
        return { projectId, userId: 'user-42' };
      },
      getSubscriptionStatus: async (userId) => {
        calls.push(`subscription:${userId}`);
        return {
          plan: 'team',
          planLabel: 'Team',
          isActive: false,
        };
      },
    });

    const decision = await service.evaluateMutationAccess({
      toolName: 'create_tasks',
      projectId: 'project-9',
    });

    assert.deepEqual(calls, ['project:project-9', 'subscription:user-42']);
    assert.equal(decision.allowed, false);
    assert.equal(decision.enforcement?.code, 'SUBSCRIPTION_EXPIRED');
    assert.equal(decision.enforcement?.plan, 'team');
  });
});
