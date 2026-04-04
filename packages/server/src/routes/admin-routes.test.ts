import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const adminRoutesSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/admin-routes.ts'), 'utf8');

describe('admin trial route registration', () => {
  it('registers POST /api/admin/users/:id/trial/start with authMiddleware + requireAdminAccess', () => {
    assert.match(
      adminRoutesSource,
      /fastify\.post\('\/api\/admin\/users\/:id\/trial\/start',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireAdminAccess\]\s*\}/,
    );
  });

  it('registers POST /api/admin/users/:id/trial/extend with authMiddleware + requireAdminAccess', () => {
    assert.match(
      adminRoutesSource,
      /fastify\.post\('\/api\/admin\/users\/:id\/trial\/extend',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireAdminAccess\]\s*\}/,
    );
  });

  it('registers POST /api/admin/users/:id/trial/end with authMiddleware + requireAdminAccess', () => {
    assert.match(
      adminRoutesSource,
      /fastify\.post\('\/api\/admin\/users\/:id\/trial\/end',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireAdminAccess\]\s*\}/,
    );
  });

  it('registers POST /api/admin/users/:id/trial/rollback with authMiddleware + requireAdminAccess', () => {
    assert.match(
      adminRoutesSource,
      /fastify\.post\('\/api\/admin\/users\/:id\/trial\/rollback',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireAdminAccess\]\s*\}/,
    );
  });

  it('registers POST /api/admin/users/:id/trial/convert with authMiddleware + requireAdminAccess', () => {
    assert.match(
      adminRoutesSource,
      /fastify\.post\('\/api\/admin\/users\/:id\/trial\/convert',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireAdminAccess\]\s*\}/,
    );
  });
});

describe('admin trial route handler behavior', () => {
  it('trial/start calls trialService.startTrial with source admin', () => {
    assert.match(
      adminRoutesSource,
      /trialService\.startTrial\(userId,\s*\{[\s\S]*?source:\s*'admin'/,
    );
  });

  it('trial/extend calls trialService.extendTrial with days from body', () => {
    assert.match(
      adminRoutesSource,
      /trialService\.extendTrial\(userId,\s*body\.days/,
    );
  });

  it('trial/end calls trialService.endTrialNow', () => {
    assert.match(
      adminRoutesSource,
      /trialService\.endTrialNow\(userId/,
    );
  });

  it('trial/rollback calls trialService.rollbackTrialToFree and returns overLimitProjects', () => {
    assert.match(
      adminRoutesSource,
      /trialService\.rollbackTrialToFree\(userId/,
    );
    assert.match(
      adminRoutesSource,
      /overLimitProjects:\s*result\.overLimitProjects/,
    );
  });

  it('trial/convert calls trialService.convertTrialToPaid with paidPlan and period', () => {
    assert.match(
      adminRoutesSource,
      /trialService\.convertTrialToPaid\(userId,\s*\{[\s\S]*?paidPlan:/,
    );
  });

  it('trial/start returns buildAdminUserDetails on success', () => {
    assert.match(
      adminRoutesSource,
      /fastify\.post\('\/api\/admin\/users\/:id\/trial\/start'[\s\S]*?const details = await buildAdminUserDetails\(userId\);\s*return reply\.send\(details\);/,
    );
  });

  it('trial/start returns 400 on TrialService errors', () => {
    assert.match(
      adminRoutesSource,
      /fastify\.post\('\/api\/admin\/users\/:id\/trial\/start'[\s\S]*?reply\.status\(400\)\.send\(\{ error:/,
    );
  });
});

describe('admin user details trial metadata', () => {
  it('buildAdminUserDetails returns billingState in subscription', () => {
    assert.match(
      adminRoutesSource,
      /billingState:\s*subscriptionRecord\?\.billingState/,
    );
  });

  it('buildAdminUserDetails returns trial metadata object', () => {
    assert.match(
      adminRoutesSource,
      /trial:\s*\{[\s\S]*?startedAt:/,
    );
  });

  it('buildAdminUserDetails returns billingEvents', () => {
    assert.match(
      adminRoutesSource,
      /billingEvents:/,
    );
  });

  it('buildAdminUserSummary returns billingState', () => {
    assert.match(
      adminRoutesSource,
      /billingState:\s*subscription\?\.billingState/,
    );
  });
});

describe('admin trial route import', () => {
  it('imports TrialService from trial-service', () => {
    assert.match(
      adminRoutesSource,
      /import \{ TrialService \} from '\.\.\/services\/trial-service\.js'/,
    );
  });

  it('instantiates TrialService', () => {
    assert.match(
      adminRoutesSource,
      /const trialService = new TrialService\(\)/,
    );
  });
});
