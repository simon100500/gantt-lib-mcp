import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';

const routeSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/backup-routes.ts'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'packages/server/src/index.ts'), 'utf8');

describe('backup routes', () => {
  it('registers backup routes in server startup', () => {
    assert.match(indexSource, /import \{ registerBackupRoutes \} from '\.\/routes\/backup-routes\.js';/);
    assert.match(indexSource, /await registerBackupRoutes\(fastify\);/);
  });

  it('defines authenticated backup export and editor-only import routes', () => {
    assert.match(routeSource, /fastify\.get\('\/api\/export\/backup', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(routeSource, /fastify\.post\('\/api\/import\/backup', \{ preHandler: \[authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation\] \}, async \(req, reply\) => \{/);
  });

  it('sends backup exports as json attachments and maps malformed restores to validation_error', () => {
    assert.match(routeSource, /application\/json; charset=utf-8/);
    assert.match(routeSource, /filename\*=/);
    assert.match(routeSource, /reason: 'validation_error'/);
    assert.match(routeSource, /error: 'backup required'/);
    assert.match(routeSource, /parseProjectBackupFile\(body\.backup\)/);
  });
});
