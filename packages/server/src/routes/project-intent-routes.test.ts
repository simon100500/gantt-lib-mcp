import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(resolve(currentDir, '../index.ts'), 'utf8');
const routeSource = readFileSync(resolve(currentDir, './project-intent-routes.ts'), 'utf8');
const prismaSchemaSource = readFileSync(resolve(process.cwd(), 'packages/runtime-core/prisma/schema.prisma'), 'utf8');

describe('project intent routes registration', () => {
  it('registers project intent routes in server startup', () => {
    assert.match(indexSource, /import \{ registerProjectIntentRoutes \} from '\.\/routes\/project-intent-routes\.js';/);
    assert.match(indexSource, /await registerProjectIntentRoutes\(fastify\);/);
  });

  it('defines project generation job schema and read endpoints', () => {
    assert.match(prismaSchemaSource, /enum ProjectGenerationJobStatus/);
    assert.match(prismaSchemaSource, /model ProjectGenerationJob/);
    assert.match(routeSource, /fastify\.get\('\/api\/project-generation-jobs\/active'/);
    assert.match(routeSource, /fastify\.get\('\/api\/project-generation-jobs\/latest'/);
    assert.match(routeSource, /fastify\.get\('\/api\/project-generation-jobs\/:jobId'/);
  });

  it('starts prepared intent generation via a persisted project generation job', () => {
    assert.match(routeSource, /startProjectGenerationJob\(\{/);
    assert.match(routeSource, /generationJob: createProjectGenerationJobTracker\(job\.id\)/);
    assert.match(routeSource, /job: serializeProjectGenerationJob\(job\)/);
  });
});
