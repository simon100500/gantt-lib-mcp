import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const commandRoutesSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/command-routes.ts'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'packages/server/src/index.ts'), 'utf8');
const commandServiceSource = readFileSync(resolve(process.cwd(), 'packages/runtime-core/src/services/command.service.ts'), 'utf8');
const prismaSchemaSource = readFileSync(resolve(process.cwd(), 'packages/runtime-core/prisma/schema.prisma'), 'utf8');

describe('chat and command enforcement routes', () => {
  it('keeps chat guarded by auth, active-subscription, and ai_queries enforcement before usage increment', () => {
    assert.match(
      indexSource,
      /const requireAiQueryLimit = requireTrackedLimit\('ai_queries', \{\s*code: 'AI_LIMIT_REACHED',\s*upgradeHint: 'Upgrade your plan to continue AI-assisted changes\.',\s*\}\);/,
    );
    assert.match(
      indexSource,
      /fastify\.post\('\/api\/chat', \{ preHandler: \[authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation, requireAiQueryLimit\] \}, async \(req, reply\) => \{[\s\S]*await incrementAiUsage\(req\.projectAccess\?\.billingUserId \?\? req\.user!\.userId\);/,
    );
  });

  it('guards command commits with the active subscription check before commitCommand runs', () => {
    assert.match(
      commandRoutesSource,
      /fastify\.post\('\/api\/commands\/commit', \{ preHandler: \[authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation\] \}, async \(req, reply\) => \{[\s\S]*commandService\.commitCommand\(request, actorType, actorId\)/,
    );
  });

  it('exposes project shift as a dedicated batch command endpoint', () => {
    assert.match(
      commandRoutesSource,
      /fastify\.post\('\/api\/commands\/shift-project', \{ preHandler: \[authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation\] \}, async \(req, reply\) => \{[\s\S]*type: 'shift_project'[\s\S]*commandService\.commitCommand\(request, actorType, actorId\)/,
    );
  });

  it('logs manual user commands before and after commit execution', () => {
    assert.match(
      commandRoutesSource,
      /writeServerDebugLog\('user_command_received'/,
    );
    assert.match(
      commandRoutesSource,
      /writeServerDebugLog\('user_command_completed'/,
    );
    assert.match(
      commandRoutesSource,
      /writeServerDebugLog\('user_command_failed'/,
    );
  });

  it('keeps command commits idempotent by project and client request id', () => {
    assert.match(prismaSchemaSource, /clientRequestId\s+String\?\s+@map\("client_request_id"\)/);
    assert.match(prismaSchemaSource, /@@unique\(\[projectId, clientRequestId\]\)/);
    assert.match(
      commandServiceSource,
      /tx\.projectEvent\.findFirst\(\{\s*where: \{\s*projectId,\s*clientRequestId,\s*applied: true,/,
    );
  });
});
