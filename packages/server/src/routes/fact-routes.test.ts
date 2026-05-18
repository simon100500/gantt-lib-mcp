import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';

const factRoutesSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/fact-routes.ts'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'packages/server/src/index.ts'), 'utf8');
const schemaSource = readFileSync(resolve(process.cwd(), 'packages/runtime-core/prisma/schema.prisma'), 'utf8');

describe('fact routes', () => {
  it('registers dedicated fact API routes in server startup', () => {
    assert.match(indexSource, /import \{ registerFactRoutes \} from '\.\/routes\/fact-routes\.js';/);
    assert.match(indexSource, /await registerFactRoutes\(fastify\);/);
  });

  it('uses a write-scoped token model instead of ShareLink for fact access', () => {
    assert.match(schemaSource, /model FactAccessToken \{/);
    assert.match(schemaSource, /slug\s+String\s+@unique/);
    assert.match(schemaSource, /includedTaskIds String\[\]\s+@default\(\[\]\)/);
    assert.match(schemaSource, /revokedAt\s+DateTime\?/);
    assert.match(schemaSource, /expiresAt\s+DateTime\?/);
    assert.match(schemaSource, /lastUsedAt\s+DateTime\?/);
    assert.match(factRoutesSource, /prisma\.factAccessToken\.findUnique/);
    assert.doesNotMatch(factRoutesSource, /shareLink/i);
  });

  it('exposes authenticated manager endpoints for creating, listing, and revoking fact tokens', () => {
    assert.match(factRoutesSource, /fastify\.get\('\/api\/projects\/:id\/fact-access-tokens', \{ preHandler: \[authMiddleware\] \}/);
    assert.match(factRoutesSource, /fastify\.post\('\/api\/projects\/:id\/fact-access-tokens', \{ preHandler: \[authMiddleware\] \}/);
    assert.match(factRoutesSource, /fastify\.post\('\/api\/projects\/:id\/fact-access-tokens\/:tokenId\/revoke', \{ preHandler: \[authMiddleware\] \}/);
    assert.match(factRoutesSource, /resolveProjectAccess\(req\.user!\.userId, projectId\)/);
    assert.match(factRoutesSource, /createdByUserId: req\.user!\.userId/);
  });

  it('generates short opaque MAX-compatible slugs instead of JWTs', () => {
    assert.match(factRoutesSource, /function generateFactSlug\(\): string \{/);
    assert.match(factRoutesSource, /`f_\$\{randomBytes\(9\)\.toString\('base64url'\)\}`/);
    assert.doesNotMatch(factRoutesSource, /jwt\.sign/);
  });

  it('replaces a task date fact amount instead of incrementing it', () => {
    assert.match(factRoutesSource, /taskProgressEntry\.upsert/);
    assert.match(factRoutesSource, /update: \{ amount \}/);
    assert.match(factRoutesSource, /deleteMany\(\{[\s\S]*entryDate,[\s\S]*\}\)/);
    assert.doesNotMatch(factRoutesSource, /increment:/);
  });

  it('blocks parent tasks and tasks outside the token inclusion set', () => {
    assert.match(factRoutesSource, /Fact can only be entered for leaf tasks/);
    assert.match(factRoutesSource, /token\.includedTaskIds\.length > 0 && !token\.includedTaskIds\.includes/);
    assert.match(factRoutesSource, /Task is not available for this token/);
  });

  it('persists the minimal day-close journal with task, date, state, reason, comment, token, and created time', () => {
    assert.match(schemaSource, /model FactDayCloseEntry \{/);
    assert.match(schemaSource, /state\s+FactDayCloseState/);
    assert.match(schemaSource, /reason\s+String\?/);
    assert.match(schemaSource, /comment\s+String\?/);
    assert.match(schemaSource, /tokenId\s+String/);
    assert.match(schemaSource, /createdAt DateTime\s+@default\(now\(\)\)/);
    assert.match(factRoutesSource, /factDayCloseEntry\.upsert/);
  });

  it('builds the fact worklist from daily plan entries, current schedule spans, and overdue unfinished tasks', () => {
    assert.match(factRoutesSource, /planByTaskId\.has\(task\.id\)/);
    assert.match(factRoutesSource, /isTaskScheduledOnDate\(task, dateKey\)/);
    assert.match(factRoutesSource, /isTaskOverdueUnfinished\(task, dateKey\)/);
  });

  it('uses local current date for default fact date instead of UTC ISO day', () => {
    assert.match(factRoutesSource, /function currentDateKey\(\): string \{/);
    assert.match(factRoutesSource, /now\.getFullYear\(\)/);
    assert.doesNotMatch(factRoutesSource, /return new Date\(\)\.toISOString\(\)\.slice\(0, 10\);/);
  });
});
