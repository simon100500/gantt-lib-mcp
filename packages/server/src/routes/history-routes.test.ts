import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const historyRoutesSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/history-routes.ts'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'packages/server/src/index.ts'), 'utf8');

describe('history routes', () => {
  it('registers registerHistoryRoutes in server startup', () => {
    assert.match(indexSource, /import \{ registerHistoryRoutes \} from '\.\/routes\/history-routes\.js';/);
    assert.match(indexSource, /await registerHistoryRoutes\(fastify\);/);
  });

  it('guards history endpoints with authMiddleware', () => {
    assert.match(
      historyRoutesSource,
      /fastify\.get\('\/api\/history', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/,
    );
    assert.match(
      historyRoutesSource,
      /fastify\.get\('\/api\/history\/:groupId\/snapshot', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/,
    );
    assert.match(
      historyRoutesSource,
      /fastify\.post\('\/api\/history\/:groupId\/restore', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/,
    );
  });

  it('defines the version-oriented history endpoints with typed failure handling', () => {
    assert.match(historyRoutesSource, /fastify\.get\('\/api\/history'/);
    assert.match(historyRoutesSource, /fastify\.get\('\/api\/history\/:groupId\/snapshot'/);
    assert.match(historyRoutesSource, /fastify\.post\('\/api\/history\/:groupId\/restore'/);
    assert.match(historyRoutesSource, /version_conflict/);
    assert.match(historyRoutesSource, /validation_error/);
    assert.doesNotMatch(historyRoutesSource, /\/api\/history\/undo/);
    assert.doesNotMatch(historyRoutesSource, /\/api\/history\/:groupId\/undo/);
    assert.doesNotMatch(historyRoutesSource, /\/api\/history\/:groupId\/redo/);
  });

  it('returns version rows, snapshots, and restore payload fields', () => {
    assert.match(historyRoutesSource, /commandCount/);
    assert.match(historyRoutesSource, /isCurrent/);
    assert.match(historyRoutesSource, /canRestore/);
    assert.match(historyRoutesSource, /currentVersion/);
    assert.match(historyRoutesSource, /targetGroupId/);
    assert.match(historyRoutesSource, /snapshot/);
    assert.match(historyRoutesSource, /version/);
    assert.match(historyRoutesSource, /nextCursor/);
  });
});
