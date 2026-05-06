import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const routeSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/excel-import-routes.ts'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'packages/server/src/index.ts'), 'utf8');

describe('excel import routes', () => {
  it('registers registerExcelImportRoutes in server startup', () => {
    assert.match(indexSource, /import \{ registerExcelImportRoutes \} from '\.\/routes\/excel-import-routes\.js';/);
    assert.match(indexSource, /await registerExcelImportRoutes\(fastify\);/);
  });

  it('defines authenticated preview and commit endpoints guarded by schedule mutation access', () => {
    assert.match(routeSource, /fastify\.post\('\/api\/import\/excel\/preview', \{ preHandler: \[authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation\] \}, async \(req, reply\) => \{/);
    assert.match(routeSource, /fastify\.post\('\/api\/import\/excel\/commit', \{ preHandler: \[authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation\] \}, async \(req, reply\) => \{/);
    assert.match(routeSource, /buildExcelImportPreview/);
    assert.match(routeSource, /commitExcelImport/);
  });

  it('defines a template download endpoint with xlsx headers', () => {
    assert.match(routeSource, /fastify\.get\('\/api\/import\/excel\/template', \{ preHandler: \[authMiddleware\] \}, async/);
    assert.match(routeSource, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
    assert.match(routeSource, /Content-Disposition/);
  });

  it('maps import validation failures to stable validation_error responses', () => {
    assert.match(routeSource, /function isExcelImportValidationError\(error: unknown\): error is ExcelImportValidationError/);
    assert.match(routeSource, /reason: 'validation_error'/);
    assert.match(routeSource, /issues: error\.issues/);
  });
});
