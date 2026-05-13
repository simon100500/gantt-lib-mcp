import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AssignmentService, AssignmentValidationError } from './assignment.service.js';
import { ResourceService, ResourceValidationError } from './resource.service.js';
import type {
  CreateProjectResourceInput,
  ListProjectResourcesInput,
  ListTaskAssignmentsInput,
  ReplaceTaskAssignmentsInput,
  UpdateProjectResourceInput,
} from '../types.js';

type ProjectRow = { id: string; userId: string; groupId: string };
type TaskRow = { id: string; projectId: string; parentId: string | null };
type ResourceRow = {
  id: string;
  userId: string;
  projectId: string | null;
  projectGroupId: string | null;
  name: string;
  type: 'human' | 'equipment' | 'material' | 'other';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
};
type AssignmentRow = {
  id: string;
  projectId: string;
  taskId: string;
  resourceId: string;
  createdAt: Date;
};
type SubscriptionRow = {
  userId: string;
  plan: string;
  billingState?: string | null;
};

class FakeRuntimeCorePrisma {
  readonly projects = new Map<string, ProjectRow>();
  readonly tasks = new Map<string, TaskRow>();
  readonly resources = new Map<string, ResourceRow>();
  readonly assignments = new Map<string, AssignmentRow>();
  readonly subscriptions = new Map<string, SubscriptionRow>();

  readonly project = {
    findUnique: async ({ where, select }: { where: { id: string }; select?: { id?: true; userId?: true; groupId?: true } }): Promise<ProjectRow | null> => {
      const project = this.projects.get(where.id) ?? null;
      if (!project) {
        return null;
      }
      if (!select) {
        return { ...project };
      }
      return {
        id: project.id,
        userId: project.userId,
        groupId: project.groupId,
      };
    },
  };

  readonly subscription = {
    findUnique: async ({ where }: { where: { userId: string }; select?: { plan?: true; billingState?: true } }): Promise<SubscriptionRow | null> => {
      const subscription = this.subscriptions.get(where.userId) ?? null;
      return subscription ? { ...subscription } : null;
    },
  };

  readonly task = {
    findUnique: async ({ where, include }: { where: { id: string }; include?: { children: { select: { id: true } } } }): Promise<(TaskRow & { children?: Array<{ id: string }> }) | null> => {
      const task = this.tasks.get(where.id) ?? null;
      if (!task) {
        return null;
      }

      if (!include?.children) {
        return { ...task };
      }

      const children = Array.from(this.tasks.values())
        .filter((candidate) => candidate.parentId === task.id)
        .map((child) => ({ id: child.id }));

      return {
        ...task,
        children,
      };
    },
  };

  readonly resource = {
    findMany: async ({ where }: { where: { userId?: string; projectId?: string | null; projectGroupId?: string | null; isActive?: boolean; id?: { in: string[] }; OR?: Array<{ projectId: string | null } | { projectId: string } | { projectGroupId: string }> } }) => {
      return Array.from(this.resources.values())
        .filter((resource) => (where.userId === undefined ? true : resource.userId === where.userId))
        .filter((resource) => (where.projectId === undefined ? true : resource.projectId === where.projectId))
        .filter((resource) => (where.projectGroupId === undefined ? true : resource.projectGroupId === where.projectGroupId))
        .filter((resource) => (where.isActive === undefined ? true : resource.isActive === where.isActive))
        .filter((resource) => (where.id?.in ? where.id.in.includes(resource.id) : true))
        .filter((resource) => {
          if (!where.OR || where.OR.length === 0) {
            return true;
          }
          return where.OR.some((clause) => (
            'projectGroupId' in clause ? resource.projectGroupId === clause.projectGroupId : resource.projectId === clause.projectId
          ));
        })
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((resource) => ({ ...resource }));
    },
    findFirst: async ({ where, select }: { where: { id?: string; userId?: string; projectId?: string | null; projectGroupId?: string | null; name?: string; OR?: Array<{ projectId: string | null } | { projectId: string } | { projectGroupId: string }> }; select?: { id: true } }) => {
      const found = Array.from(this.resources.values()).find((resource) => {
        if (where.userId !== undefined && resource.userId !== where.userId) {
          return false;
        }
        if (where.projectId !== undefined && resource.projectId !== where.projectId) {
          return false;
        }
        if (where.projectGroupId !== undefined && resource.projectGroupId !== where.projectGroupId) {
          return false;
        }
        if (where.id !== undefined && resource.id !== where.id) {
          return false;
        }
        if (where.name !== undefined && resource.name !== where.name) {
          return false;
        }
        if (where.OR && where.OR.length > 0 && !where.OR.some((clause) => (
          'projectGroupId' in clause ? resource.projectGroupId === clause.projectGroupId : resource.projectId === clause.projectId
        ))) {
          return false;
        }
        return true;
      });

      if (!found) {
        return null;
      }

      return select?.id ? { id: found.id } : { ...found };
    },
    create: async ({ data }: { data: { id: string; userId: string; projectId: string | null; projectGroupId: string | null; name: string; type: ResourceRow['type'] } }) => {
      const now = new Date();
      const row: ResourceRow = {
        id: data.id,
        userId: data.userId,
        projectId: data.projectId,
        projectGroupId: data.projectGroupId,
        name: data.name,
        type: data.type,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        deactivatedAt: null,
      };
      this.resources.set(row.id, row);
      return { ...row };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Pick<ResourceRow, 'name' | 'type' | 'isActive' | 'deactivatedAt' | 'projectId' | 'projectGroupId'>> }) => {
      const existing = this.resources.get(where.id);
      if (!existing) {
        throw new Error(`Missing resource ${where.id}`);
      }
      const updated: ResourceRow = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      this.resources.set(updated.id, updated);
      return { ...updated };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = this.resources.get(where.id);
      if (!existing) {
        throw new Error(`Missing resource ${where.id}`);
      }
      this.resources.delete(where.id);
      return { ...existing };
    },
  };

  readonly taskAssignment = {
    findMany: async ({ where, include }: { where: { projectId: string; taskId: string }; include?: { resource: true } }) => {
      return Array.from(this.assignments.values())
        .filter((assignment) => assignment.projectId === where.projectId && assignment.taskId === where.taskId)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.resourceId.localeCompare(right.resourceId))
        .map((assignment) => ({
          ...assignment,
          resource: include?.resource ? this.resources.get(assignment.resourceId) ?? undefined : undefined,
        }));
    },
    deleteMany: async ({ where }: { where: { projectId: string; taskId: string; resourceId?: { in: string[] } } }) => {
      let count = 0;
      for (const [id, assignment] of Array.from(this.assignments.entries())) {
        if (assignment.projectId !== where.projectId || assignment.taskId !== where.taskId) {
          continue;
        }
        if (where.resourceId?.in && !where.resourceId.in.includes(assignment.resourceId)) {
          continue;
        }
        this.assignments.delete(id);
        count += 1;
      }
      return { count };
    },
    createMany: async ({ data }: { data: Array<{ id: string; projectId: string; taskId: string; resourceId: string }> }) => {
      let count = 0;
      for (const row of data) {
        const duplicate = Array.from(this.assignments.values()).some(
          (assignment) => assignment.taskId === row.taskId && assignment.resourceId === row.resourceId,
        );
        if (duplicate) {
          continue;
        }
        this.assignments.set(row.id, {
          ...row,
          createdAt: new Date(),
        });
        count += 1;
      }
      return { count };
    },
  };

  async $transaction<T>(fn: (tx: FakeRuntimeCorePrisma) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

function createFixture() {
  const prisma = new FakeRuntimeCorePrisma();
  prisma.projects.set('project-1', { id: 'project-1', userId: 'workspace-user-1', groupId: 'group-1' });
  prisma.projects.set('project-2', { id: 'project-2', userId: 'workspace-user-1', groupId: 'group-1' });
  prisma.projects.set('project-3', { id: 'project-3', userId: 'workspace-user-2', groupId: 'group-3' });
  prisma.projects.set('project-4', { id: 'project-4', userId: 'workspace-user-1', groupId: 'group-2' });
  prisma.subscriptions.set('workspace-user-1', { userId: 'workspace-user-1', plan: 'free', billingState: 'free' });
  prisma.subscriptions.set('workspace-user-2', { userId: 'workspace-user-2', plan: 'free', billingState: 'free' });

  prisma.tasks.set('parent-task', { id: 'parent-task', projectId: 'project-1', parentId: null });
  prisma.tasks.set('leaf-task', { id: 'leaf-task', projectId: 'project-1', parentId: 'parent-task' });
  prisma.tasks.set('project-2-leaf-task', { id: 'project-2-leaf-task', projectId: 'project-2', parentId: null });
  prisma.tasks.set('project-3-leaf-task', { id: 'project-3-leaf-task', projectId: 'project-3', parentId: null });
  prisma.tasks.set('project-4-leaf-task', { id: 'project-4-leaf-task', projectId: 'project-4', parentId: null });
  prisma.tasks.set('branch-parent', { id: 'branch-parent', projectId: 'project-1', parentId: null });
  prisma.tasks.set('branch-mid', { id: 'branch-mid', projectId: 'project-1', parentId: 'branch-parent' });
  prisma.tasks.set('branch-leaf-a', { id: 'branch-leaf-a', projectId: 'project-1', parentId: 'branch-mid' });
  prisma.tasks.set('branch-leaf-b', { id: 'branch-leaf-b', projectId: 'project-1', parentId: 'branch-parent' });
  prisma.tasks.set('empty-parent', { id: 'empty-parent', projectId: 'project-1', parentId: null });
  prisma.tasks.set('other-project-task', { id: 'other-project-task', projectId: 'project-2', parentId: null });

  const resourceService = new ResourceService({ prisma });
  const assignmentService = new AssignmentService({ prisma });

  return { prisma, resourceService, assignmentService };
}

describe('resource and assignment service contracts', () => {
  it('creates, lists, renames, and deactivates project-local resources', async () => {
    const { resourceService } = createFixture();

    const created = await resourceService.create({
      projectId: 'project-1',
      name: 'Design crew',
      type: 'human',
      scope: 'project',
    } satisfies CreateProjectResourceInput);

    assert.equal(created.projectId, 'project-1');
    assert.equal(created.userId, 'workspace-user-1');
    assert.equal(created.scope, 'project');
    assert.equal(created.isActive, true);
    assert.equal(created.type, 'human');

    const listed = await resourceService.list({ projectId: 'project-1', includeInactive: true } satisfies ListProjectResourcesInput);
    assert.equal(listed.resources.length, 1);
    assert.equal(listed.resources[0]?.name, 'Design crew');
    assert.equal(listed.resources[0]?.scope, 'project');

    const renamed = await resourceService.update({
      projectId: 'project-1',
      resourceId: created.id,
      name: 'Field crew',
      type: 'equipment',
    } satisfies UpdateProjectResourceInput);

    assert.equal(renamed.name, 'Field crew');
    assert.equal(renamed.type, 'equipment');
    assert.equal(renamed.scope, 'project');

    const deactivated = await resourceService.deactivate('project-1', created.id);
    assert.equal(deactivated.isActive, false);
    assert.ok(deactivated.deactivatedAt);

    const activeOnly = await resourceService.list({ projectId: 'project-1' });
    assert.equal(activeOnly.resources.length, 0);

    const allResources = await resourceService.list({ projectId: 'project-1', includeInactive: true });
    assert.equal(allResources.resources.length, 1);
    assert.equal(allResources.resources[0]?.isActive, false);
  });

  it('deletes a resource inside the current workspace boundary', async () => {
    const { resourceService } = createFixture();

    const created = await resourceService.create({
      projectId: 'project-1',
      name: 'Delete crew',
      type: 'human',
      scope: 'project',
    } satisfies CreateProjectResourceInput);

    const deleted = await resourceService.delete({
      projectId: 'project-1',
      resourceId: created.id,
    });

    assert.equal(deleted.id, created.id);

    const listed = await resourceService.list({ projectId: 'project-1', includeInactive: true });
    assert.equal(listed.resources.some((resource) => resource.id === created.id), false);
  });

  it('lists shared resources across same-workspace projects while hiding foreign local resources', async () => {
    const { resourceService } = createFixture();

    const shared = await resourceService.create({
      projectId: 'project-1',
      name: 'Shared crew',
      scope: 'shared',
    });
    const localProject1 = await resourceService.create({
      projectId: 'project-1',
      name: 'Project 1 local',
      scope: 'project',
    });
    await resourceService.create({
      projectId: 'project-2',
      name: 'Project 2 local',
      scope: 'project',
    });
    await resourceService.create({
      projectId: 'project-3',
      name: 'Other workspace shared',
      scope: 'shared',
    });
    await resourceService.create({
      projectId: 'project-4',
      name: 'Other group shared',
      scope: 'shared',
    });

    const project1View = await resourceService.list({ projectId: 'project-1', includeInactive: true });
    assert.deepEqual(
      project1View.resources.map((resource) => ({ name: resource.name, scope: resource.scope })).sort((a, b) => a.name.localeCompare(b.name)),
      [
        { name: 'Project 1 local', scope: 'project' },
        { name: 'Shared crew', scope: 'shared' },
      ],
    );

    const project2View = await resourceService.list({ projectId: 'project-2', includeInactive: true });
    assert.deepEqual(
      project2View.resources.map((resource) => ({ name: resource.name, scope: resource.scope, projectId: resource.projectId })).sort((a, b) => a.name.localeCompare(b.name)),
      [
        { name: 'Project 2 local', scope: 'project', projectId: 'project-2' },
        { name: 'Shared crew', scope: 'shared', projectId: null },
      ],
    );

    assert.equal(shared.projectId, null);
    assert.equal(localProject1.projectId, 'project-1');
  });

  it('rejects empty names and duplicate names within the same ownership scope', async () => {
    const { resourceService } = createFixture();

    await assert.rejects(
      () => resourceService.create({ projectId: 'project-1', name: '   ' }),
      (error: unknown) => {
        assert.ok(error instanceof ResourceValidationError);
        assert.equal(error.issue.code, 'invalid_input');
        return true;
      },
    );

    const shared = await resourceService.create({ projectId: 'project-1', name: 'Crew A', scope: 'shared' });
    assert.equal(shared.name, 'Crew A');

    await assert.rejects(
      () => resourceService.create({ projectId: 'project-2', name: 'Crew A', scope: 'shared' }),
      (error: unknown) => {
        assert.ok(error instanceof ResourceValidationError);
        assert.equal(error.issue.code, 'resource_name_conflict');
        return true;
      },
    );

    const local = await resourceService.create({ projectId: 'project-1', name: 'Local A', scope: 'project' });
    assert.equal(local.scope, 'project');

    await assert.rejects(
      () => resourceService.create({ projectId: 'project-1', name: 'Local A', scope: 'project' }),
      (error: unknown) => {
        assert.ok(error instanceof ResourceValidationError);
        assert.equal(error.issue.code, 'resource_name_conflict');
        return true;
      },
    );

    const siblingLocal = await resourceService.create({ projectId: 'project-2', name: 'Local A', scope: 'project' });
    assert.equal(siblingLocal.projectId, 'project-2');
  });

  it('limits free users to three resources in the current resource pool', async () => {
    const { resourceService } = createFixture();

    await resourceService.create({ projectId: 'project-1', name: 'Crew A', scope: 'project' });
    await resourceService.create({ projectId: 'project-1', name: 'Crew B', scope: 'project' });
    await resourceService.create({ projectId: 'project-1', name: 'Crew C', scope: 'shared' });

    await assert.rejects(
      () => resourceService.create({ projectId: 'project-1', name: 'Crew D', scope: 'project' }),
      (error: unknown) => {
        assert.ok(error instanceof ResourceValidationError);
        assert.equal(error.issue.code, 'resource_limit_reached');
        assert.equal(error.message, 'На бесплатном тарифе можно создать не больше 3 ресурсов.');
        return true;
      },
    );
  });

  it('replaces leaf assignments idempotently for mixed shared and local resources and supports empty assignment sets', async () => {
    const { resourceService, assignmentService } = createFixture();
    const shared = await resourceService.create({ projectId: 'project-1', name: 'Shared Alpha', scope: 'shared' });
    const local = await resourceService.create({ projectId: 'project-1', name: 'Local Beta', scope: 'project' });

    const firstSet = await assignmentService.replaceForTask({
      projectId: 'project-1',
      taskId: 'leaf-task',
      resourceIds: [shared.id, local.id],
    } satisfies ReplaceTaskAssignmentsInput);

    assert.deepEqual(
      firstSet.resources.map((resource) => ({ name: resource.name, scope: resource.scope })).sort((a, b) => a.name.localeCompare(b.name)),
      [
        { name: 'Local Beta', scope: 'project' },
        { name: 'Shared Alpha', scope: 'shared' },
      ],
    );
    assert.equal(firstSet.assignments.length, 2);

    const repeated = await assignmentService.replaceForTask({
      projectId: 'project-1',
      taskId: 'leaf-task',
      resourceIds: [shared.id, local.id],
    });
    assert.equal(repeated.assignments.length, 2);

    const sharedInSiblingProject = await assignmentService.replaceForTask({
      projectId: 'project-2',
      taskId: 'project-2-leaf-task',
      resourceIds: [shared.id],
    });
    assert.equal(sharedInSiblingProject.resources.length, 1);
    assert.equal(sharedInSiblingProject.resources[0]?.scope, 'shared');

    const cleared = await assignmentService.replaceForTask({
      projectId: 'project-1',
      taskId: 'leaf-task',
      resourceIds: [],
    });
    assert.equal(cleared.assignments.length, 0);
    assert.equal(cleared.resources.length, 0);

    const listed = await assignmentService.list({
      projectId: 'project-1',
      taskId: 'leaf-task',
    } satisfies ListTaskAssignmentsInput);
    assert.equal(listed.assignments.length, 0);
  });

  it('materializes parent assignments only to descendant leaf tasks and stays idempotent', async () => {
    const { prisma, resourceService, assignmentService } = createFixture();
    const shared = await resourceService.create({ projectId: 'project-1', name: 'Shared Alpha', scope: 'shared' });
    const beta = await resourceService.create({ projectId: 'project-1', name: 'Beta', scope: 'project' });

    const first = await assignmentService.materializeForParentTask({
      projectId: 'project-1',
      taskId: 'branch-parent',
      resourceIds: [shared.id, beta.id],
    });

    assert.equal(first.requestedTaskId, 'branch-parent');
    assert.deepEqual([...first.leafTaskIds].sort(), ['branch-leaf-a', 'branch-leaf-b']);
    assert.deepEqual(
      first.taskAssignments.map((entry) => entry.taskId).sort(),
      ['branch-leaf-a', 'branch-leaf-b'],
    );
    assert.ok(first.taskAssignments.every((entry) => entry.assignments.length === 2));

    const parentAssignments = Array.from(prisma.assignments.values()).filter((row) => row.taskId === 'branch-parent');
    assert.equal(parentAssignments.length, 0, 'no persisted parent assignment rows should be created');

    const firstAssignmentCount = prisma.assignments.size;
    const repeated = await assignmentService.materializeForParentTask({
      projectId: 'project-1',
      taskId: 'branch-parent',
      resourceIds: [shared.id, beta.id],
    });

    assert.equal(prisma.assignments.size, firstAssignmentCount, 'repeated materialization should be idempotent');
    assert.deepEqual([...repeated.leafTaskIds].sort(), ['branch-leaf-a', 'branch-leaf-b']);
    assert.equal(Array.from(prisma.assignments.values()).filter((row) => row.taskId === 'branch-parent').length, 0);
  });

  it('materializes a single-leaf parent without creating a parent row', async () => {
    const { prisma, resourceService, assignmentService } = createFixture();
    const alpha = await resourceService.create({ projectId: 'project-1', name: 'Alpha', scope: 'shared' });

    const result = await assignmentService.materializeForParentTask({
      projectId: 'project-1',
      taskId: 'parent-task',
      resourceIds: [alpha.id],
    });

    assert.deepEqual(result.leafTaskIds, ['leaf-task']);
    assert.equal(result.taskAssignments.length, 1);
    assert.equal(result.taskAssignments[0]?.taskId, 'leaf-task');
    assert.equal(result.taskAssignments[0]?.assignments.length, 1);
    assert.equal(Array.from(prisma.assignments.values()).filter((row) => row.taskId === 'parent-task').length, 0);
  });

  it('rejects malformed input and stable no-leaf parent materialization failures', async () => {
    const { resourceService, assignmentService } = createFixture();
    const alpha = await resourceService.create({ projectId: 'project-1', name: 'Alpha', scope: 'shared' });

    await assert.rejects(
      () => assignmentService.replaceForTask({ projectId: '   ', taskId: 'leaf-task', resourceIds: [alpha.id] }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'invalid_input');
        assert.equal(error.issue.field, 'projectId');
        return true;
      },
    );

    await assert.rejects(
      () => assignmentService.replaceForTask({ projectId: 'project-1', taskId: '   ', resourceIds: [alpha.id] }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'invalid_input');
        assert.equal(error.issue.field, 'taskId');
        return true;
      },
    );

    await assert.rejects(
      () => assignmentService.replaceForTask({ projectId: 'project-1', taskId: 'leaf-task', resourceIds: ['   '] }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'invalid_input');
        assert.equal(error.issue.field, 'resourceIds');
        return true;
      },
    );

    await assert.rejects(
      () => assignmentService.materializeForParentTask({ projectId: 'project-1', taskId: 'empty-parent', resourceIds: [alpha.id] }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'task_has_no_leaf_descendants');
        assert.equal(error.issue.field, 'taskId');
        return true;
      },
    );
  });

  it('rejects duplicate resource ids in one assignment request', async () => {
    const { resourceService, assignmentService } = createFixture();
    const resource = await resourceService.create({ projectId: 'project-1', name: 'Alpha', scope: 'shared' });

    await assert.rejects(
      () => assignmentService.replaceForTask({
        projectId: 'project-1',
        taskId: 'leaf-task',
        resourceIds: [resource.id, resource.id],
      }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'duplicate_resource_id');
        return true;
      },
    );
  });

  it('keeps persisted inactive-resource assignments readable while rejecting new writes with resource_inactive', async () => {
    const { resourceService, assignmentService } = createFixture();
    const active = await resourceService.create({ projectId: 'project-1', name: 'Alpha', scope: 'shared' });
    const inactiveLater = await resourceService.create({ projectId: 'project-1', name: 'Crew to deactivate', scope: 'project' });

    const assigned = await assignmentService.replaceForTask({
      projectId: 'project-1',
      taskId: 'leaf-task',
      resourceIds: [active.id, inactiveLater.id],
    });

    assert.deepEqual(
      assigned.resources.map((resource) => ({ id: resource.id, isActive: resource.isActive })).sort((left, right) => left.id.localeCompare(right.id)),
      [
        { id: active.id, isActive: true },
        { id: inactiveLater.id, isActive: true },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );

    await resourceService.deactivate('project-1', inactiveLater.id);

    const listed = await assignmentService.list({
      projectId: 'project-1',
      taskId: 'leaf-task',
    } satisfies ListTaskAssignmentsInput);

    assert.deepEqual(
      listed.assignments.map((assignment) => assignment.resourceId).sort(),
      [active.id, inactiveLater.id].sort(),
    );
    assert.deepEqual(
      listed.resources.map((resource) => ({ id: resource.id, isActive: resource.isActive })).sort((left, right) => left.id.localeCompare(right.id)),
      [
        { id: active.id, isActive: true },
        { id: inactiveLater.id, isActive: false },
      ].sort((left, right) => left.id.localeCompare(right.id)),
      'persisted assignments should still round-trip with inactive resource details on read',
    );

    await assert.rejects(
      () => assignmentService.replaceForTask({
        projectId: 'project-1',
        taskId: 'leaf-task',
        resourceIds: [inactiveLater.id],
      }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'resource_inactive');
        assert.equal(error.issue.field, 'resourceId');
        assert.equal(error.issue.detail, inactiveLater.id);
        return true;
      },
    );
  });

  it('rejects missing resources, inactive resources, non-leaf direct replacement, and foreign-local assignment leakage', async () => {
    const { resourceService, assignmentService } = createFixture();
    const shared = await resourceService.create({ projectId: 'project-1', name: 'Shared Alpha', scope: 'shared' });
    const foreignLocal = await resourceService.create({ projectId: 'project-2', name: 'External local crew', scope: 'project' });
    const foreignWorkspaceShared = await resourceService.create({ projectId: 'project-3', name: 'Other workspace shared', scope: 'shared' });
    const foreignGroupShared = await resourceService.create({ projectId: 'project-4', name: 'Other group shared', scope: 'shared' });
    const inactive = await resourceService.create({ projectId: 'project-1', name: 'Inactive crew', scope: 'project' });
    await resourceService.deactivate('project-1', inactive.id);

    await assert.rejects(
      () => assignmentService.replaceForTask({
        projectId: 'project-1',
        taskId: 'missing-task',
        resourceIds: [shared.id],
      }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'task_not_found');
        return true;
      },
    );

    await assert.rejects(
      () => assignmentService.replaceForTask({
        projectId: 'project-1',
        taskId: 'leaf-task',
        resourceIds: ['missing-resource'],
      }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'resource_not_found');
        return true;
      },
    );

    await assert.rejects(
      () => assignmentService.replaceForTask({
        projectId: 'project-1',
        taskId: 'leaf-task',
        resourceIds: [inactive.id],
      }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'resource_inactive');
        return true;
      },
    );

    await assert.rejects(
      () => assignmentService.replaceForTask({
        projectId: 'project-1',
        taskId: 'parent-task',
        resourceIds: [shared.id],
      }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'task_not_leaf');
        return true;
      },
    );

    await assert.rejects(
      () => assignmentService.replaceForTask({
        projectId: 'project-1',
        taskId: 'leaf-task',
        resourceIds: [foreignLocal.id],
      }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'resource_not_found');
        assert.equal(error.issue.detail, foreignLocal.id);
        return true;
      },
    );

    await assert.rejects(
      () => assignmentService.replaceForTask({
        projectId: 'project-1',
        taskId: 'leaf-task',
        resourceIds: [foreignWorkspaceShared.id],
      }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'resource_not_found');
        assert.equal(error.issue.detail, foreignWorkspaceShared.id);
        return true;
      },
    );

    await assert.rejects(
      () => assignmentService.replaceForTask({
        projectId: 'project-1',
        taskId: 'leaf-task',
        resourceIds: [foreignGroupShared.id],
      }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'resource_not_found');
        assert.equal(error.issue.detail, foreignGroupShared.id);
        return true;
      },
    );

    await assert.rejects(
      () => assignmentService.replaceForTask({
        projectId: 'project-1',
        taskId: 'other-project-task',
        resourceIds: [shared.id],
      }),
      (error: unknown) => {
        assert.ok(error instanceof AssignmentValidationError);
        assert.equal(error.issue.code, 'cross_project_mismatch');
        return true;
      },
    );
  });
});
