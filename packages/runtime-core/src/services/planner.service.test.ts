import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlannerService, PlannerValidationError } from './planner.service.js';
import type { GetResourcePlannerInput } from '../types.js';

type ProjectRow = {
  id: string;
  userId: string;
  groupId: string;
  name: string;
  status: 'active' | 'archived' | 'deleted';
  createdAt: Date;
};

type ResourceRow = {
  id: string;
  userId: string;
  projectId: string | null;
  projectGroupId: string | null;
  name: string;
  isActive: boolean;
};

type TaskRow = {
  id: string;
  projectId: string;
  name: string;
  startDate: Date;
  endDate: Date;
};

type AssignmentRow = {
  id: string;
  projectId: string;
  taskId: string;
  resourceId: string;
  createdAt: Date;
};

class FakePlannerPrisma {
  readonly projects = new Map<string, ProjectRow>();
  readonly resources = new Map<string, ResourceRow>();
  readonly tasks = new Map<string, TaskRow>();
  readonly assignments = new Map<string, AssignmentRow>();

  readonly project = {
    findUnique: async ({ where }: { where: { id: string }; select: { id: true; userId: true } }) => {
      const project = this.projects.get(where.id) ?? null;
      if (!project) {
        return null;
      }
      return { id: project.id, userId: project.userId, groupId: project.groupId };
    },
    findMany: async ({ where }: { where: { userId: string; groupId?: string; status?: { not: 'deleted' }; id?: { in: string[] } }; select: { id: true; name: true; userId: true; groupId: true } }) => {
      return Array.from(this.projects.values())
        .filter((project) => project.userId === where.userId)
        .filter((project) => (where.groupId ? project.groupId === where.groupId : true))
        .filter((project) => (where.status?.not ? project.status !== where.status.not : true))
        .filter((project) => (where.id?.in ? where.id.in.includes(project.id) : true))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
        .map((project) => ({ id: project.id, name: project.name, userId: project.userId, groupId: project.groupId }));
    },
  };

  readonly taskAssignment = {
    findMany: async ({ where }: { where: { projectId: { in: string[] }; resource: { userId: string; projectId?: null | string | { in: Array<string | null> }; projectGroupId?: string; OR?: Array<{ projectGroupId: string } | { projectId: null } | { projectId: { in: string[] } }> } } }) => {
      const resourceProjectMatches = (resource: ResourceRow): boolean => {
        if (where.resource.OR) {
          return where.resource.OR.some((branch) => {
            if ('projectId' in branch && branch.projectId === null) {
              return resource.projectId === null;
            }
            if ('projectGroupId' in branch) {
              return resource.projectGroupId === branch.projectGroupId;
            }
            if ('projectId' in branch && typeof branch.projectId === 'object' && 'in' in branch.projectId) {
              return resource.projectId !== null && branch.projectId.in.includes(resource.projectId);
            }
            return false;
          });
        }

        if ('projectId' in where.resource) {
          const projectIdFilter = where.resource.projectId;
          if (projectIdFilter && typeof projectIdFilter === 'object' && 'in' in projectIdFilter) {
            return projectIdFilter.in.includes(resource.projectId);
          }

          return resource.projectId === projectIdFilter;
        }

        if ('projectGroupId' in where.resource && where.resource.projectGroupId !== undefined) {
          return resource.projectGroupId === where.resource.projectGroupId;
        }

        return true;
      };

      return Array.from(this.assignments.values())
        .filter((assignment) => where.projectId.in.includes(assignment.projectId))
        .map((assignment) => {
          const resource = this.resources.get(assignment.resourceId) ?? null;
          const task = this.tasks.get(assignment.taskId) ?? null;
          const project = task ? this.projects.get(task.projectId) ?? null : null;

          if (!resource || resource.userId !== where.resource.userId || !resourceProjectMatches(resource)) {
            return null;
          }

          return {
            id: assignment.id,
            createdAt: assignment.createdAt,
            projectId: assignment.projectId,
            taskId: assignment.taskId,
            resource: {
              id: resource.id,
              projectId: resource.projectId,
              projectGroupId: resource.projectGroupId,
              userId: resource.userId,
              name: resource.name,
              isActive: resource.isActive,
            },
            task: task
              ? {
                  id: task.id,
                  name: task.name,
                  projectId: task.projectId,
                  startDate: task.startDate,
                  endDate: task.endDate,
                  project: project
                    ? {
                        id: project.id,
                        name: project.name,
                        userId: project.userId,
                      }
                    : null,
                }
              : null,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .sort((left, right) => {
          return (
            left.resource.id.localeCompare(right.resource.id)
            || left.projectId.localeCompare(right.projectId)
            || left.taskId.localeCompare(right.taskId)
            || left.createdAt.getTime() - right.createdAt.getTime()
          );
        });
    },
  };
}

function createFixture() {
  const prisma = new FakePlannerPrisma();
  const now = new Date('2026-04-20T12:00:00.000Z');

  prisma.projects.set('project-alpha', {
    id: 'project-alpha',
    userId: 'workspace-1',
    groupId: 'group-1',
    name: 'Alpha Project',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  prisma.projects.set('project-beta', {
    id: 'project-beta',
    userId: 'workspace-1',
    groupId: 'group-1',
    name: 'Beta Project',
    status: 'active',
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  prisma.projects.set('project-deleted', {
    id: 'project-deleted',
    userId: 'workspace-1',
    groupId: 'group-1',
    name: 'Deleted Project',
    status: 'deleted',
    createdAt: new Date('2026-01-03T00:00:00.000Z'),
  });
  prisma.projects.set('project-foreign', {
    id: 'project-foreign',
    userId: 'workspace-2',
    groupId: 'group-foreign',
    name: 'Foreign Project',
    status: 'active',
    createdAt: new Date('2026-01-04T00:00:00.000Z'),
  });
  prisma.projects.set('project-gamma', {
    id: 'project-gamma',
    userId: 'workspace-1',
    groupId: 'group-2',
    name: 'Gamma Project',
    status: 'active',
    createdAt: new Date('2026-01-05T00:00:00.000Z'),
  });

  prisma.resources.set('shared-designer', {
    id: 'shared-designer',
    userId: 'workspace-1',
    projectId: null,
    projectGroupId: 'group-1',
    name: 'Shared Designer',
    isActive: true,
  });
  prisma.resources.set('shared-qa', {
    id: 'shared-qa',
    userId: 'workspace-1',
    projectId: null,
    projectGroupId: 'group-1',
    name: 'Shared QA',
    isActive: true,
  });
  prisma.resources.set('local-alpha-only', {
    id: 'local-alpha-only',
    userId: 'workspace-1',
    projectId: 'project-alpha',
    projectGroupId: null,
    name: 'Alpha Local Crew',
    isActive: true,
  });
  prisma.resources.set('local-beta-only', {
    id: 'local-beta-only',
    userId: 'workspace-1',
    projectId: 'project-beta',
    projectGroupId: null,
    name: 'Beta Local Crew',
    isActive: true,
  });
  prisma.resources.set('foreign-local', {
    id: 'foreign-local',
    userId: 'workspace-2',
    projectId: 'project-foreign',
    projectGroupId: null,
    name: 'Foreign Local Crew',
    isActive: true,
  });
  prisma.resources.set('foreign-shared', {
    id: 'foreign-shared',
    userId: 'workspace-2',
    projectId: null,
    projectGroupId: 'group-foreign',
    name: 'Foreign Shared Crew',
    isActive: true,
  });
  prisma.resources.set('other-group-shared', {
    id: 'other-group-shared',
    userId: 'workspace-1',
    projectId: null,
    projectGroupId: 'group-2',
    name: 'Other Group Shared Crew',
    isActive: true,
  });

  prisma.tasks.set('task-alpha-plan', {
    id: 'task-alpha-plan',
    projectId: 'project-alpha',
    name: 'Alpha planning',
    startDate: new Date('2026-05-01T00:00:00.000Z'),
    endDate: new Date('2026-05-03T00:00:00.000Z'),
  });
  prisma.tasks.set('task-beta-build', {
    id: 'task-beta-build',
    projectId: 'project-beta',
    name: 'Beta build',
    startDate: new Date('2026-05-04T00:00:00.000Z'),
    endDate: new Date('2026-05-08T00:00:00.000Z'),
  });
  prisma.tasks.set('task-beta-review', {
    id: 'task-beta-review',
    projectId: 'project-beta',
    name: 'Beta review',
    startDate: new Date('2026-05-09T00:00:00.000Z'),
    endDate: new Date('2026-05-10T00:00:00.000Z'),
  });
  prisma.tasks.set('task-foreign', {
    id: 'task-foreign',
    projectId: 'project-foreign',
    name: 'Foreign task',
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-06-02T00:00:00.000Z'),
  });
  prisma.tasks.set('task-gamma', {
    id: 'task-gamma',
    projectId: 'project-gamma',
    name: 'Gamma task',
    startDate: new Date('2026-05-03T00:00:00.000Z'),
    endDate: new Date('2026-05-05T00:00:00.000Z'),
  });

  prisma.assignments.set('assignment-alpha', {
    id: 'assignment-alpha',
    projectId: 'project-alpha',
    taskId: 'task-alpha-plan',
    resourceId: 'shared-designer',
    createdAt: new Date(now.getTime() + 1_000),
  });
  prisma.assignments.set('assignment-beta-build', {
    id: 'assignment-beta-build',
    projectId: 'project-beta',
    taskId: 'task-beta-build',
    resourceId: 'shared-designer',
    createdAt: new Date(now.getTime() + 2_000),
  });
  prisma.assignments.set('assignment-beta-review', {
    id: 'assignment-beta-review',
    projectId: 'project-beta',
    taskId: 'task-beta-review',
    resourceId: 'shared-qa',
    createdAt: new Date(now.getTime() + 3_000),
  });
  prisma.assignments.set('assignment-alpha-local', {
    id: 'assignment-alpha-local',
    projectId: 'project-alpha',
    taskId: 'task-alpha-plan',
    resourceId: 'local-alpha-only',
    createdAt: new Date(now.getTime() + 4_000),
  });
  prisma.assignments.set('assignment-local-leak', {
    id: 'assignment-local-leak',
    projectId: 'project-beta',
    taskId: 'task-beta-build',
    resourceId: 'local-beta-only',
    createdAt: new Date(now.getTime() + 5_000),
  });
  prisma.assignments.set('assignment-foreign-shared', {
    id: 'assignment-foreign-shared',
    projectId: 'project-foreign',
    taskId: 'task-foreign',
    resourceId: 'foreign-shared',
    createdAt: new Date(now.getTime() + 6_000),
  });
  prisma.assignments.set('assignment-other-group-shared', {
    id: 'assignment-other-group-shared',
    projectId: 'project-gamma',
    taskId: 'task-gamma',
    resourceId: 'other-group-shared',
    createdAt: new Date(now.getTime() + 6_500),
  });
  prisma.assignments.set('assignment-missing-task', {
    id: 'assignment-missing-task',
    projectId: 'project-beta',
    taskId: 'missing-task',
    resourceId: 'shared-designer',
    createdAt: new Date(now.getTime() + 7_000),
  });

  const plannerService = new PlannerService({ prisma });
  return { prisma, plannerService };
}

describe('planner service contracts', () => {
  it('aggregates one shared resource across sibling projects into one authoritative planner payload', async () => {
    const { plannerService, prisma } = createFixture();

    prisma.tasks.set('task-beta-overlap', {
      id: 'task-beta-overlap',
      projectId: 'project-beta',
      name: 'Beta overlap',
      startDate: new Date('2026-05-02T00:00:00.000Z'),
      endDate: new Date('2026-05-05T00:00:00.000Z'),
    });
    prisma.assignments.set('assignment-beta-overlap', {
      id: 'assignment-beta-overlap',
      projectId: 'project-beta',
      taskId: 'task-beta-overlap',
      resourceId: 'shared-designer',
      createdAt: new Date('2026-04-20T12:00:07.000Z'),
    });

    const result = await plannerService.getResourcePlanner({
      projectId: 'project-alpha',
    } satisfies GetResourcePlannerInput);

    assert.equal(result.projectId, 'project-alpha');
    assert.equal(result.scope, 'all-projects');
    assert.equal(result.workspaceUserId, 'workspace-1');
    assert.equal(result.resources.length, 2);

    const sharedDesigner = result.resources.find((resource) => resource.resourceId === 'shared-designer');
    assert.ok(sharedDesigner);
    assert.equal(sharedDesigner.resourceName, 'Shared Designer');
    assert.equal(sharedDesigner.intervals.length, 3);
    assert.equal(sharedDesigner.conflictCount, 3);
    assert.equal(sharedDesigner.hasConflicts, true);
    assert.deepEqual(
      sharedDesigner.intervals.map((interval) => ({
        assignmentId: interval.assignmentId,
        projectId: interval.projectId,
        projectName: interval.projectName,
        taskId: interval.taskId,
        taskName: interval.taskName,
        startDate: interval.startDate,
        endDate: interval.endDate,
        hasConflict: interval.hasConflict,
        conflictAssignmentIds: interval.conflictAssignmentIds,
        conflictCount: interval.conflictCount,
      })),
      [
        {
          assignmentId: 'assignment-alpha',
          projectId: 'project-alpha',
          projectName: 'Alpha Project',
          taskId: 'task-alpha-plan',
          taskName: 'Alpha planning',
          startDate: '2026-05-01',
          endDate: '2026-05-03',
          hasConflict: true,
          conflictAssignmentIds: ['assignment-beta-overlap'],
          conflictCount: 1,
        },
        {
          assignmentId: 'assignment-beta-overlap',
          projectId: 'project-beta',
          projectName: 'Beta Project',
          taskId: 'task-beta-overlap',
          taskName: 'Beta overlap',
          startDate: '2026-05-02',
          endDate: '2026-05-05',
          hasConflict: true,
          conflictAssignmentIds: ['assignment-alpha', 'assignment-beta-build'],
          conflictCount: 2,
        },
        {
          assignmentId: 'assignment-beta-build',
          projectId: 'project-beta',
          projectName: 'Beta Project',
          taskId: 'task-beta-build',
          taskName: 'Beta build',
          startDate: '2026-05-04',
          endDate: '2026-05-08',
          hasConflict: true,
          conflictAssignmentIds: ['assignment-beta-overlap'],
          conflictCount: 1,
        },
      ],
    );

    const sharedQa = result.resources.find((resource) => resource.resourceId === 'shared-qa');
    assert.ok(sharedQa);
    assert.equal(sharedQa.hasConflicts, false);
    assert.equal(sharedQa.conflictCount, 0);
    assert.equal(sharedQa.intervals.length, 1);
    assert.equal(sharedQa.intervals[0]?.projectName, 'Beta Project');
    assert.equal(sharedQa.intervals[0]?.taskName, 'Beta review');
    assert.equal(sharedQa.intervals[0]?.hasConflict, false);
    assert.deepEqual(sharedQa.intervals[0]?.conflictAssignmentIds, []);
    assert.equal(sharedQa.intervals[0]?.conflictCount, 0);
  });

  it('returns current-project shared and same-project local resources without foreign local leakage', async () => {
    const { plannerService } = createFixture();

    const result = await plannerService.getResourcePlanner({ projectId: 'project-alpha', scope: 'current-project' });

    assert.equal(result.projectId, 'project-alpha');
    assert.equal(result.scope, 'current-project');
    assert.equal(result.workspaceUserId, 'workspace-1');
    assert.deepEqual(
      result.resources.map((resource) => resource.resourceId),
      ['local-alpha-only', 'shared-designer'],
    );

    const sharedDesigner = result.resources.find((resource) => resource.resourceId === 'shared-designer');
    assert.ok(sharedDesigner);
    assert.deepEqual(
      sharedDesigner.intervals.map((interval) => interval.assignmentId),
      ['assignment-alpha'],
      'current-project scope should keep shared-resource assignments only for the active project',
    );

    const localAlpha = result.resources.find((resource) => resource.resourceId === 'local-alpha-only');
    assert.ok(localAlpha);
    assert.deepEqual(
      localAlpha.intervals.map((interval) => ({
        assignmentId: interval.assignmentId,
        projectId: interval.projectId,
        projectName: interval.projectName,
      })),
      [{ assignmentId: 'assignment-alpha-local', projectId: 'project-alpha', projectName: 'Alpha Project' }],
      'current-project scope should include project-local resources owned by the active project',
    );

    const allIntervalIds = result.resources.flatMap((resource) => resource.intervals.map((interval) => interval.assignmentId));
    assert.equal(allIntervalIds.includes('assignment-beta-build'), false, 'current-project scope must not include sibling project shared assignments');
    assert.equal(allIntervalIds.includes('assignment-local-leak'), false, 'current-project scope must not include sibling project-local resources');
  });

  it('preserves all-project scope as workspace-wide shared-only planner data', async () => {
    const { plannerService } = createFixture();

    const result = await plannerService.getResourcePlanner({ projectId: 'project-alpha', scope: 'all-projects' });

    assert.equal(result.scope, 'all-projects');
    assert.deepEqual(
      result.resources.map((resource) => resource.resourceId),
      ['shared-designer', 'shared-qa'],
    );

    const allIntervalIds = result.resources.flatMap((resource) => resource.intervals.map((interval) => interval.assignmentId));
    assert.equal(allIntervalIds.includes('assignment-alpha'), true);
    assert.equal(allIntervalIds.includes('assignment-beta-build'), true);
    assert.equal(allIntervalIds.includes('assignment-beta-review'), true);
    assert.equal(allIntervalIds.includes('assignment-other-group-shared'), false, 'all-projects scope must exclude shared resources from sibling groups');
    assert.equal(allIntervalIds.includes('assignment-alpha-local'), false, 'all-projects scope must exclude current project-local resources');
    assert.equal(allIntervalIds.includes('assignment-local-leak'), false, 'all-projects scope must exclude sibling project-local resources');
  });

  it('treats adjacent intervals as non-overlapping and returns stable conflict metadata across repeated reads', async () => {
    const { plannerService } = createFixture();

    const first = await plannerService.getResourcePlanner({ projectId: 'project-alpha' });
    const second = await plannerService.getResourcePlanner({ projectId: 'project-alpha' });

    const sharedDesigner = first.resources.find((resource) => resource.resourceId === 'shared-designer');
    assert.ok(sharedDesigner);
    assert.equal(sharedDesigner.hasConflicts, false);
    assert.equal(sharedDesigner.conflictCount, 0);
    assert.deepEqual(
      sharedDesigner.intervals.map((interval) => ({
        assignmentId: interval.assignmentId,
        hasConflict: interval.hasConflict,
        conflictAssignmentIds: interval.conflictAssignmentIds,
        conflictCount: interval.conflictCount,
      })),
      [
        {
          assignmentId: 'assignment-alpha',
          hasConflict: false,
          conflictAssignmentIds: [],
          conflictCount: 0,
        },
        {
          assignmentId: 'assignment-beta-build',
          hasConflict: false,
          conflictAssignmentIds: [],
          conflictCount: 0,
        },
      ],
      'endDate touching next startDate should stay adjacency, not a conflict',
    );

    assert.deepEqual(second, first, 'planner conflict annotations should be deterministic across repeated reads');
  });

  it('returns an empty but valid planner payload when the workspace has no shared assignments', async () => {
    const { plannerService, prisma } = createFixture();
    prisma.assignments.clear();

    const result = await plannerService.getResourcePlanner({ projectId: 'project-alpha' });

    assert.deepEqual(result, {
      projectId: 'project-alpha',
      projectGroupId: 'group-1',
      scope: 'all-projects',
      workspaceUserId: 'workspace-1',
      resources: [],
    });
  });

  it('drops malformed rows and excludes project-local or foreign-workspace leakage', async () => {
    const { plannerService, prisma } = createFixture();

    prisma.assignments.set('assignment-cross-project-local', {
      id: 'assignment-cross-project-local',
      projectId: 'project-alpha',
      taskId: 'task-alpha-plan',
      resourceId: 'foreign-local',
      createdAt: new Date('2026-04-20T12:00:10.000Z'),
    });
    prisma.assignments.set('assignment-bad-project-link', {
      id: 'assignment-bad-project-link',
      projectId: 'project-alpha',
      taskId: 'task-beta-build',
      resourceId: 'shared-designer',
      createdAt: new Date('2026-04-20T12:00:11.000Z'),
    });

    const result = await plannerService.getResourcePlanner({ projectId: 'project-alpha' });

    assert.deepEqual(
      result.resources.map((resource) => resource.resourceName),
      ['Shared Designer', 'Shared QA'],
      'only same-workspace shared resources should survive normalization',
    );

    const allIntervalIds = result.resources.flatMap((resource) => resource.intervals.map((interval) => interval.assignmentId));
    assert.equal(allIntervalIds.includes('assignment-local-leak'), false, 'project-local resources must not leak into planner view');
    assert.equal(allIntervalIds.includes('assignment-foreign-shared'), false, 'foreign workspace shared resources must not leak into planner view');
    assert.equal(allIntervalIds.includes('assignment-cross-project-local'), false, 'foreign local resources must not leak into planner view');
    assert.equal(allIntervalIds.includes('assignment-missing-task'), false, 'malformed rows with missing task joins must be dropped');
    assert.equal(allIntervalIds.includes('assignment-bad-project-link'), false, 'mismatched task/project joins must be dropped');
  });

  it('rejects malformed and unknown project inputs with typed validation failures', async () => {
    const { plannerService } = createFixture();

    await assert.rejects(
      () => plannerService.getResourcePlanner({ projectId: '   ' }),
      (error: unknown) => {
        assert.ok(error instanceof PlannerValidationError);
        assert.equal(error.issue.code, 'invalid_input');
        assert.equal(error.issue.field, 'projectId');
        return true;
      },
    );

    await assert.rejects(
      () => plannerService.getResourcePlanner({ projectId: 'missing-project' }),
      (error: unknown) => {
        assert.ok(error instanceof PlannerValidationError);
        assert.equal(error.issue.code, 'project_not_found');
        assert.equal(error.issue.field, 'projectId');
        return true;
      },
    );

    await assert.rejects(
      () => plannerService.getResourcePlanner({ projectId: 'project-alpha', scope: 'everything' as never }),
      (error: unknown) => {
        assert.ok(error instanceof PlannerValidationError);
        assert.equal(error.issue.code, 'planner_scope_invalid');
        assert.equal(error.issue.field, 'scope');
        assert.equal(error.issue.detail, 'everything');
        return true;
      },
    );
  });
});
