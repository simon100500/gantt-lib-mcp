import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const indexSource = readFileSync(resolve(process.cwd(), 'packages/server/src/index.ts'), 'utf8');
const routeSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/grand-smeta-import-routes.ts'), 'utf8');

describe('grand smeta import routes', () => {
  it('registers grand smeta import route module in server index', () => {
    assert.match(indexSource, /import \{ registerGrandSmetaImportRoutes \} from '\.\/routes\/grand-smeta-import-routes\.js';/);
    assert.match(indexSource, /await registerGrandSmetaImportRoutes\(fastify\);/);
  });

  it('protects preview and commit routes with auth and project edit access', () => {
    assert.match(routeSource, /fastify\.post\('\/api\/import\/grandsmeta\/preview', \{ preHandler: \[authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation\] \}, async \(req, reply\) => \{/);
    assert.match(routeSource, /fastify\.post\('\/api\/import\/grandsmeta\/commit', \{ preHandler: \[authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation\] \}, async \(req, reply\) => \{/);
  });
});
