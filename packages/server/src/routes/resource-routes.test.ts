import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';

const resourceRoutesSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/resource-routes.ts'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'packages/server/src/index.ts'), 'utf8');
const apiTypesSource = readFileSync(resolve(process.cwd(), 'packages/web/src/lib/apiTypes.ts'), 'utf8');

describe('resource routes', () => {
  it('registers registerResourceRoutes in server startup', () => {
    assert.match(indexSource, /import \{ registerResourceRoutes \} from '\.\/routes\/resource-routes\.js';/);
    assert.match(indexSource, /await registerResourceRoutes\(fastify\);/);
  });

  it('guards resource, planner, and assignment endpoints with authMiddleware', () => {
    assert.match(resourceRoutesSource, /fastify\.get\('\/api\/resources\/planner', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(resourceRoutesSource, /fastify\.get\('\/api\/resources', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(resourceRoutesSource, /fastify\.post\('\/api\/resources', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(resourceRoutesSource, /fastify\.patch\('\/api\/resources\/:resourceId', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(resourceRoutesSource, /fastify\.post\('\/api\/tasks\/:taskId\/assignments', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(resourceRoutesSource, /fastify\.post\('\/api\/tasks\/:taskId\/assignments\/materialize', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
  });

  it('registers a dedicated planner route that delegates to plannerService with stable validation_error mapping', () => {
    assert.match(resourceRoutesSource, /import \{[\s\S]*plannerService,[\s\S]*PlannerValidationError,[\s\S]*\} from '@gantt\/mcp\/services';/);
    assert.match(resourceRoutesSource, /function isPlannerValidationError\(error: unknown\): error is PlannerValidationError/);
    assert.match(resourceRoutesSource, /fastify\.get\('\/api\/resources\/planner', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(resourceRoutesSource, /plannerService\.getResourcePlanner\(\{[\s\S]*projectId: req\.user!\.projectId,[\s\S]*\}\)/);
    assert.match(resourceRoutesSource, /if \(isPlannerValidationError\(error\)\) \{/);
    assert.match(resourceRoutesSource, /return reply\.status\(400\)\.send\(\{\s*reason: 'validation_error',\s*error: error\.message,\s*issue: error\.issue,\s*\}\);/s);
  });

  it('passes ownership scope through resource create and update routes', () => {
    assert.match(resourceRoutesSource, /type ResourceBody = \{[\s\S]*scope\?: 'shared' \| 'project';[\s\S]*\};/);
    assert.match(resourceRoutesSource, /resourceService\.create\(\{[\s\S]*scope: body\.scope,[\s\S]*\}\)/);
    assert.match(resourceRoutesSource, /resourceService\.update\(\{[\s\S]*scope: body\.scope,[\s\S]*\}\)/);
  });

  it('keeps /api/project as the current-project hydration seam instead of embedding planner data', () => {
    assert.match(indexSource, /fastify\.get\('\/api\/project', \{ preHandler: \[authMiddleware\] \}, async \(req, reply\) => \{/);
    assert.match(indexSource, /const \[project, tasks, dependencies, resourceCatalog, assignments, projectCalendar\] = await Promise\.all\(/);
    assert.doesNotMatch(indexSource, /plannerService/);
    assert.doesNotMatch(indexSource, /workspaceUserId/);
  });

  it('re-exports planner transport types for the web layer without inventing a second schema', () => {
    assert.match(apiTypesSource, /export type \{[\s\S]*ResourcePlannerInterval,[\s\S]*ResourcePlannerResource,[\s\S]*ResourcePlannerResult,[\s\S]*ResourceScope,[\s\S]*ResourceType,[\s\S]*\} from '\.\.\/types\.ts';/);
    assert.doesNotMatch(apiTypesSource, /export interface ResourcePlannerResult/);
    assert.doesNotMatch(apiTypesSource, /export type ResourcePlannerResult =/);
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

  it('extends the authoritative /api/project payload with mixed-visibility resources and assignments for reload hydration, including inactive resources', () => {
    assert.match(indexSource, /snapshot: ProjectSnapshot & \{/);
    assert.match(indexSource, /resourceService\.list\(\{[\s\S]*projectId,[\s\S]*includeInactive: true,[\s\S]*\}\)/);
    assert.match(indexSource, /resources: resourceCatalog\.resources\.map/);
    assert.match(indexSource, /assignments: assignments\.map/);
    assert.match(indexSource, /userId: resource\.userId/);
    assert.match(indexSource, /projectId: resource\.projectId/);
    assert.match(indexSource, /scope: resource\.scope/);
    assert.match(indexSource, /isActive: resource\.isActive/);
    assert.match(indexSource, /deactivatedAt: resource\.deactivatedAt/);
    assert.match(indexSource, /resourceId: assignment\.resourceId/);
  });

  it('keeps /api/project resource hydration authoritative to the current project boundary and excludes foreign local resources from direct prisma filtering', () => {
    assert.match(indexSource, /const \[project, tasks, dependencies, resourceCatalog, assignments, projectCalendar\] = await Promise\.all\(/);
    assert.match(indexSource, /resourceService\.list\(/);
    assert.doesNotMatch(indexSource, /prisma\.resource\.findMany\(\{[\s\S]*where: \{ projectId \}[\s\S]*\}\)/);
  });

  it('keeps parent assignment rows absent from the authoritative load contract by serializing only persisted task_assignments rows', () => {
    assert.match(indexSource, /select: \{ id: true, projectId: true, taskId: true, resourceId: true, createdAt: true \}/);
    assert.doesNotMatch(indexSource, /requestedTaskId/);
    assert.doesNotMatch(indexSource, /leafTaskIds/);
  });
});
