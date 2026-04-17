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
      /fastify\.post\('\/api\/history\/undo', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/,
    );
    assert.match(
      historyRoutesSource,
      /fastify\.post\('\/api\/history\/:groupId\/undo', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/,
    );
    assert.match(
      historyRoutesSource,
      /fastify\.post\('\/api\/history\/:groupId\/redo', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/,
    );
  });

  it('defines the GET and POST history endpoints with typed failure handling', () => {
    assert.match(historyRoutesSource, /fastify\.get\('\/api\/history'/);
    assert.match(historyRoutesSource, /fastify\.post\('\/api\/history\/undo'/);
    assert.match(historyRoutesSource, /fastify\.post\('\/api\/history\/:groupId\/undo'/);
    assert.match(historyRoutesSource, /fastify\.post\('\/api\/history\/:groupId\/redo'/);
    assert.match(historyRoutesSource, /version_conflict/);
    assert.match(historyRoutesSource, /redo_not_available/);
    assert.match(historyRoutesSource, /history_diverged/);
    assert.match(historyRoutesSource, /target_not_undone/);
  });

  it('returns grouped history contract fields and authoritative replay payloads', () => {
    assert.match(historyRoutesSource, /commandCount/);
    assert.match(historyRoutesSource, /undoable/);
    assert.match(historyRoutesSource, /redoable/);
    assert.match(historyRoutesSource, /snapshot/);
    assert.match(historyRoutesSource, /version/);
    assert.match(historyRoutesSource, /nextCursor/);
  });
});
