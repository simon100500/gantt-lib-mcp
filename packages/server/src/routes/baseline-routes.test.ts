import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const baselineRoutesSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/baseline-routes.ts'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'packages/server/src/index.ts'), 'utf8');
const baselineServiceSource = readFileSync(resolve(process.cwd(), 'packages/runtime-core/src/services/baseline.service.ts'), 'utf8');

describe('baseline routes', () => {
  it('registers registerBaselineRoutes in server startup', () => {
    assert.match(indexSource, /import \{ registerBaselineRoutes \} from '\.\/routes\/baseline-routes\.js';/);
    assert.match(indexSource, /await registerBaselineRoutes\(fastify\);/);
  });

  it('guards baseline endpoints with authMiddleware', () => {
    assert.match(
      baselineRoutesSource,
      /fastify\.get\('\/api\/baselines', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/,
    );
    assert.match(
      baselineRoutesSource,
      /fastify\.get\('\/api\/baselines\/:baselineId', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/,
    );
    assert.match(
      baselineRoutesSource,
      /fastify\.post\('\/api\/baselines\/current', \{ preHandler: \[authMiddleware, requireCurrentProjectEditor\] \}, async \(req, reply\) => \{/,
    );
    assert.match(
      baselineRoutesSource,
      /fastify\.post\('\/api\/baselines\/history\/:groupId', \{ preHandler: \[authMiddleware, requireCurrentProjectEditor\] \}, async \(req, reply\) => \{/,
    );
    assert.match(
      baselineRoutesSource,
      /fastify\.delete\('\/api\/baselines\/:baselineId', \{ preHandler: \[authMiddleware, requireCurrentProjectEditor\] \}, async \(req, reply\) => \{/,
    );
  });

  it('keeps create-from-current and create-from-history distinct and resource-oriented', () => {
    assert.match(baselineRoutesSource, /fastify\.post\('\/api\/baselines\/current'/);
    assert.match(baselineRoutesSource, /fastify\.post\('\/api\/baselines\/history\/:groupId'/);
    assert.doesNotMatch(baselineRoutesSource, /createFromHistory\(\{\s*projectId: req\.user!\.projectId,\s*historyGroupId: req\.body/);
  });

  it('maps malformed params and typed validation failures to a validation_error body', () => {
    assert.match(baselineRoutesSource, /reason: 'validation_error'/);
    assert.match(baselineRoutesSource, /error: 'baselineId required'/);
    assert.match(baselineRoutesSource, /error: 'groupId required'/);
    assert.match(baselineRoutesSource, /error: 'name required'/);
    assert.match(baselineRoutesSource, /if \(isBaselineValidationError\(error\)\) \{/);
    assert.doesNotMatch(baselineRoutesSource, /accepted:/);
    assert.doesNotMatch(baselineRoutesSource, /currentVersion:/);
  });

  it('returns persisted baseline metadata and snapshot contract fields needed downstream', () => {
    assert.match(baselineRoutesSource, /baselines: response\.baselines/);
    assert.match(baselineRoutesSource, /id: response\.id/);
    assert.match(baselineRoutesSource, /projectId: response\.projectId/);
    assert.match(baselineRoutesSource, /name: response\.name/);
    assert.match(baselineRoutesSource, /source: response\.source/);
    assert.match(baselineRoutesSource, /sourceHistoryGroupId: response\.sourceHistoryGroupId/);
    assert.match(baselineRoutesSource, /createdAt: response\.createdAt/);
    assert.match(baselineRoutesSource, /snapshot: response\.snapshot/);
  });

  it('keeps delete resource-oriented with minimal success payload and typed validation handling', () => {
    assert.match(baselineRoutesSource, /fastify\.delete\('\/api\/baselines\/:baselineId'/);
    assert.match(baselineRoutesSource, /deleteBaseline\(\{\s*projectId: req\.user!\.projectId,\s*baselineId: params\.baselineId,\s*\}\)/s);
    assert.match(baselineRoutesSource, /return reply\.send\(\{\s*id: response\.id,\s*\}\);/s);
  });

  it('preserves history-snapshot delegation in the service layer instead of duplicating rollback logic in routes', () => {
    assert.match(baselineServiceSource, /getHistorySnapshot\(historyInput\)/);
    assert.doesNotMatch(baselineRoutesSource, /projectEvent\.findMany\(/);
    assert.doesNotMatch(baselineRoutesSource, /mutationGroup\.findMany\(/);
    assert.doesNotMatch(baselineRoutesSource, /rollback/i);
  });
});
