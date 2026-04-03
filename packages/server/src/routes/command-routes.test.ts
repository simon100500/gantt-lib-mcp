import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const commandRoutesSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/command-routes.ts'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'packages/server/src/index.ts'), 'utf8');

describe('chat and command enforcement routes', () => {
  it('keeps chat guarded by auth, active-subscription, and ai_queries enforcement before usage increment', () => {
    assert.match(
      indexSource,
      /const requireAiQueryLimit = requireTrackedLimit\('ai_queries', \{\s*code: 'AI_LIMIT_REACHED',\s*upgradeHint: 'Upgrade your plan to continue AI-assisted changes\.',\s*\}\);/,
    );
    assert.match(
      indexSource,
      /fastify\.post\('\/api\/chat', \{ preHandler: \[authMiddleware, requireActiveSubscriptionForMutation, requireAiQueryLimit\] \}, async \(req, reply\) => \{[\s\S]*await incrementAiUsage\(req\.user!\.userId\);/,
    );
  });

  it('guards command commits with the active subscription check before commitCommand runs', () => {
    assert.match(
      commandRoutesSource,
      /fastify\.post\('\/api\/commands\/commit', \{ preHandler: \[authMiddleware, requireActiveSubscriptionForMutation\] \}, async \(req, reply\) => \{[\s\S]*commandService\.commitCommand\(request, actorType, actorId\)/,
    );
  });
});
