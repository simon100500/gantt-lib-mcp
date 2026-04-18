import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const routeSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/excel-export-routes.ts'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'packages/server/src/index.ts'), 'utf8');

describe('excel export routes', () => {
  it('registers registerExcelExportRoutes in server startup', () => {
    assert.match(indexSource, /import \{ registerExcelExportRoutes \} from '\.\/routes\/excel-export-routes\.js';/);
    assert.match(indexSource, /await registerExcelExportRoutes\(fastify\);/);
  });

  it('defines authenticated excel export route with xlsx headers', () => {
    assert.match(routeSource, /fastify\.get\('\/api\/export\/excel', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(routeSource, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
    assert.match(routeSource, /Content-Disposition/);
    assert.match(routeSource, /filename\*=/);
  });

  it('rejects users without pdf_excel access', () => {
    assert.match(routeSource, /exportLimit !== 'pdf_excel' && exportLimit !== 'pdf_excel_api'/);
    assert.match(routeSource, /EXPORT_FEATURE_LOCKED/);
  });
});
