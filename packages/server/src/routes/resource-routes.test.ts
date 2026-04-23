import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';

const resourceRoutesSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/resource-routes.ts'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'packages/server/src/index.ts'), 'utf8');

describe('resource routes', () => {
  it('registers registerResourceRoutes in server startup', () => {
    assert.match(indexSource, /import \{ registerResourceRoutes \} from '\.\/routes\/resource-routes\.js';/);
    assert.match(indexSource, /await registerResourceRoutes\(fastify\);/);
  });

  it('guards resource and assignment endpoints with authMiddleware', () => {
    assert.match(resourceRoutesSource, /fastify\.get\('\/api\/resources', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(resourceRoutesSource, /fastify\.post\('\/api\/resources', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(resourceRoutesSource, /fastify\.patch\('\/api\/resources\/:resourceId', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(resourceRoutesSource, /fastify\.post\('\/api\/tasks\/:taskId\/assignments', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(resourceRoutesSource, /fastify\.post\('\/api\/tasks\/:taskId\/assignments\/materialize', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
  });

  it('keeps assignment writes resource-oriented and distinct between leaf replacement and parent materialization', () => {
    assert.match(resourceRoutesSource, /assignmentService\.replaceForTask\(\{/);
    assert.match(resourceRoutesSource, /assignmentService\.materializeForParentTask\(\{/);
    assert.doesNotMatch(resourceRoutesSource, /\/api\/commands\/commit/);
  });

  it('maps malformed params and typed assignment validation failures to stable validation_error bodies', () => {
    assert.match(resourceRoutesSource, /reason: 'validation_error'/);
    assert.match(resourceRoutesSource, /error: 'resourceId required'/);
    assert.match(resourceRoutesSource, /error: 'taskId required'/);
    assert.match(resourceRoutesSource, /error: 'resourceIds array required'/);
    assert.match(resourceRoutesSource, /if \(isAssignmentValidationError\(error\)\) \{/);
    assert.match(resourceRoutesSource, /issue: error\.issue/);
    assert.match(resourceRoutesSource, /assignmentService\.replaceForTask\(\{/);
    assert.match(resourceRoutesSource, /return reply\.status\(400\)\.send\(\{\s*reason: 'validation_error',\s*error: error\.message,\s*issue: error\.issue,\s*\}\);/s);
  });

  it('keeps inactive-resource assignment failures observable through stable route mapping', () => {
    assert.match(resourceRoutesSource, /import \{[\s\S]*AssignmentValidationError[\s\S]*\} from '@gantt\/mcp\/services';/);
    assert.match(resourceRoutesSource, /function isAssignmentValidationError\(error: unknown\): error is AssignmentValidationError/);
    assert.match(resourceRoutesSource, /error\.code === 'validation_error'/);
    assert.match(resourceRoutesSource, /'issue' in error/);
    assert.match(indexSource, /assignments: assignments\.map/);
  });

  it('extends the authoritative /api/project payload with resources and assignments for reload hydration, including inactive resources', () => {
    assert.match(indexSource, /snapshot: ProjectSnapshot & \{/);
    assert.match(indexSource, /resources: resources\.map/);
    assert.match(indexSource, /assignments: assignments\.map/);
    assert.match(indexSource, /isActive: resource\.isActive/);
    assert.match(indexSource, /deactivatedAt: resource\.deactivatedAt \? resource\.deactivatedAt\.toISOString\(\) : null/);
    assert.match(indexSource, /resourceId: assignment\.resourceId/);
    assert.match(indexSource, /prisma\.resource\.findMany/);
    assert.match(indexSource, /prisma\.taskAssignment\.findMany/);
  });

  it('keeps parent assignment rows absent from the authoritative load contract by serializing only persisted task_assignments rows', () => {
    assert.match(indexSource, /select: \{ id: true, projectId: true, taskId: true, resourceId: true, createdAt: true \}/);
    assert.doesNotMatch(indexSource, /requestedTaskId/);
    assert.doesNotMatch(indexSource, /leafTaskIds/);
  });
});
