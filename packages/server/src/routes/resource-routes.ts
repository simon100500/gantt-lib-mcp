import type { FastifyInstance } from 'fastify';
import {
  assignmentService,
  AssignmentValidationError,
  commandService,
  plannerService,
  PlannerValidationError,
  resourceService,
  ResourceValidationError,
} from '@gantt/mcp/services';
import { getPrisma } from '@gantt/runtime-core/prisma';
import type { ActorType, ProjectCommand } from '@gantt/mcp/types';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireActiveSubscriptionForMutation } from '../middleware/constraint-middleware.js';
import {
  requireCurrentProjectResourcesEditor,
  requireCurrentProjectResourcesViewer,
  resolveProjectAccess,
} from '../access-control.js';

type ResourceBody = {
  name?: string;
  projectId?: string;
  type?: 'human' | 'equipment' | 'material' | 'other';
  scope?: 'shared' | 'project';
  isActive?: boolean;
};

type AssignmentBody = {
  resourceIds?: string[];
};

type PlannerMoveBody = {
  projectId?: string;
  taskId?: string;
  assignmentId?: string;
  fromResourceId?: string;
  toResourceId?: string;
  startDate?: string;
  endDate?: string;
};

function parseResourceName(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('name' in body)) {
    return undefined;
  }

  const { name } = body as ResourceBody;
  if (typeof name !== 'string') {
    return undefined;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseAssignmentResourceIds(body: unknown): string[] | undefined {
  if (!body || typeof body !== 'object' || !('resourceIds' in body)) {
    return undefined;
  }

  const { resourceIds } = body as AssignmentBody;
  return Array.isArray(resourceIds) ? resourceIds : undefined;
}

async function resolveAccessibleProjectId(requestedProjectId: unknown, userId: string, fallbackProjectId: string, requireEdit = false): Promise<string | null> {
  const targetProjectId = typeof requestedProjectId === 'string' && requestedProjectId.trim().length > 0
    ? requestedProjectId.trim()
    : fallbackProjectId;
  const access = await resolveProjectAccess(userId, targetProjectId);

  if (!access || (requireEdit && !access.canEdit)) {
    return null;
  }

  return targetProjectId;
}

function isResourceValidationError(error: unknown): error is ResourceValidationError {
  return error instanceof ResourceValidationError || (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'validation_error' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

function isAssignmentValidationError(error: unknown): error is AssignmentValidationError {
  return error instanceof AssignmentValidationError || (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'validation_error' &&
    'message' in error &&
    typeof error.message === 'string' &&
    'issue' in error
  );
}

function isPlannerValidationError(error: unknown): error is PlannerValidationError {
  return error instanceof PlannerValidationError || (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'validation_error' &&
    'message' in error &&
    typeof error.message === 'string' &&
    'issue' in error
  );
}

function normalizeDateOnlyInput(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().split('T')[0] ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function utcDayIndex(value: string): number {
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function durationDays(startDate: string, endDate: string): number {
  return utcDayIndex(endDate) - utcDayIndex(startDate) + 1;
}

function buildPlannerDateCommands(input: {
  taskId: string;
  originalStartDate: string;
  originalEndDate: string;
  nextStartDate: string;
  nextEndDate: string;
}): ProjectCommand[] {
  const startChanged = input.originalStartDate !== input.nextStartDate;
  const endChanged = input.originalEndDate !== input.nextEndDate;

  if (!startChanged && !endChanged) {
    return [];
  }

  if (
    startChanged
    && endChanged
    && durationDays(input.originalStartDate, input.originalEndDate) === durationDays(input.nextStartDate, input.nextEndDate)
  ) {
    return [{ type: 'move_task', taskId: input.taskId, startDate: input.nextStartDate }];
  }

  if (startChanged && !endChanged) {
    return [{ type: 'resize_task', taskId: input.taskId, anchor: 'start', date: input.nextStartDate }];
  }

  if (!startChanged && endChanged) {
    return [{ type: 'resize_task', taskId: input.taskId, anchor: 'end', date: input.nextEndDate }];
  }

  return utcDayIndex(input.nextStartDate) < utcDayIndex(input.originalStartDate)
    ? [
        { type: 'resize_task', taskId: input.taskId, anchor: 'end', date: input.nextEndDate },
        { type: 'resize_task', taskId: input.taskId, anchor: 'start', date: input.nextStartDate },
      ]
    : [
        { type: 'resize_task', taskId: input.taskId, anchor: 'start', date: input.nextStartDate },
        { type: 'resize_task', taskId: input.taskId, anchor: 'end', date: input.nextEndDate },
      ];
}

export async function registerResourceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/resources/planner', { preHandler: [authMiddleware, requireCurrentProjectResourcesViewer] }, async (req, reply) => {
    try {
      const query = req.query as { scope?: string };
      const response = await plannerService.getResourcePlanner({
        projectId: req.user!.projectId,
        scope: query.scope,
      });

      return reply.send(response);
    } catch (error) {
      if (isPlannerValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.get('/api/resources', { preHandler: [authMiddleware, requireCurrentProjectResourcesViewer] }, async (req, reply) => {
    try {
      const query = req.query as { projectId?: string };
      const targetProjectId = await resolveAccessibleProjectId(query.projectId, req.user!.userId, req.user!.projectId);
      if (!targetProjectId) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: 'projectId unavailable',
        });
      }

      const response = await resourceService.list({
        projectId: targetProjectId,
        includeInactive: true,
      });

      return reply.send({ resources: response.resources });
    } catch (error) {
      if (isResourceValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.post('/api/resources', { preHandler: [authMiddleware, requireCurrentProjectResourcesEditor] }, async (req, reply) => {
    const name = parseResourceName(req.body);
    if (!name) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'name required',
      });
    }

    try {
      const body = (req.body ?? {}) as ResourceBody;
      const targetProjectId = await resolveAccessibleProjectId(body.projectId, req.user!.userId, req.user!.projectId, true);
      if (!targetProjectId) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: 'projectId unavailable',
        });
      }

      const response = await resourceService.create({
        projectId: targetProjectId,
        name,
        type: body.type,
        scope: body.scope,
      });

      return reply.status(201).send(response);
    } catch (error) {
      if (isResourceValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.patch('/api/resources/:resourceId', { preHandler: [authMiddleware, requireCurrentProjectResourcesEditor] }, async (req, reply) => {
    const params = req.params as { resourceId?: string };
    if (!params.resourceId?.trim()) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'resourceId required',
      });
    }

    try {
      const body = (req.body ?? {}) as ResourceBody;
      const response = await resourceService.update({
        projectId: req.user!.projectId,
        resourceId: params.resourceId,
        name: typeof body.name === 'string' ? body.name : undefined,
        type: body.type,
        scope: body.scope,
        isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
      });

      return reply.send(response);
    } catch (error) {
      if (isResourceValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.delete('/api/resources/:resourceId', { preHandler: [authMiddleware, requireCurrentProjectResourcesEditor] }, async (req, reply) => {
    const params = req.params as { resourceId?: string };
    if (!params.resourceId?.trim()) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'resourceId required',
      });
    }

    try {
      const response = await resourceService.delete({
        projectId: req.user!.projectId,
        resourceId: params.resourceId,
      });

      return reply.send(response);
    } catch (error) {
      if (isResourceValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.post('/api/tasks/:taskId/assignments', { preHandler: [authMiddleware, requireCurrentProjectResourcesEditor] }, async (req, reply) => {
    const params = req.params as { taskId?: string };
    if (!params.taskId?.trim()) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'taskId required',
      });
    }

    const resourceIds = parseAssignmentResourceIds(req.body);
    if (!resourceIds) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'resourceIds array required',
      });
    }

    try {
      const response = await assignmentService.replaceForTask({
        projectId: req.user!.projectId,
        taskId: params.taskId,
        resourceIds,
      });

      return reply.send(response);
    } catch (error) {
      if (isAssignmentValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.post('/api/tasks/:taskId/assignments/materialize', { preHandler: [authMiddleware, requireCurrentProjectResourcesEditor] }, async (req, reply) => {
    const params = req.params as { taskId?: string };
    if (!params.taskId?.trim()) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'taskId required',
      });
    }

    const resourceIds = parseAssignmentResourceIds(req.body);
    if (!resourceIds) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'resourceIds array required',
      });
    }

    try {
      const response = await assignmentService.materializeForParentTask({
        projectId: req.user!.projectId,
        taskId: params.taskId,
        resourceIds,
      });

      return reply.send(response);
    } catch (error) {
      if (isAssignmentValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.post('/api/resources/planner/move', { preHandler: [authMiddleware, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const body = (req.body ?? {}) as PlannerMoveBody;
    const targetProjectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
    const assignmentId = typeof body.assignmentId === 'string' ? body.assignmentId.trim() : '';
    const fromResourceId = typeof body.fromResourceId === 'string' ? body.fromResourceId.trim() : '';
    const toResourceId = typeof body.toResourceId === 'string' ? body.toResourceId.trim() : '';
    const nextStartDate = normalizeDateOnlyInput(body.startDate);
    const nextEndDate = normalizeDateOnlyInput(body.endDate);

    if (!targetProjectId || !taskId || !assignmentId || !fromResourceId || !toResourceId || !nextStartDate || !nextEndDate) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'projectId, taskId, assignmentId, fromResourceId, toResourceId, startDate, and endDate are required',
      });
    }

    const access = await resolveProjectAccess(req.user!.userId, targetProjectId);
    if (!access || access.permissions.resources !== 'edit' || access.permissions.schedule !== 'edit') {
      return reply.status(403).send({ error: 'Project schedule and resources edit access required' });
    }

    const prisma = getPrisma();
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId: targetProjectId },
      select: { id: true, startDate: true, endDate: true },
    });
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    const assignment = await prisma.taskAssignment.findFirst({
      where: { id: assignmentId, projectId: targetProjectId, taskId, resourceId: fromResourceId },
      select: { id: true },
    });
    if (!assignment) {
      return reply.status(404).send({ error: 'Assignment not found' });
    }

    const project = await prisma.project.findUnique({
      where: { id: targetProjectId },
      select: { version: true },
    });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const actorType: ActorType = 'user';
    const actorId = req.user!.userId;
    let baseVersion = project.version;
    const dateCommands = buildPlannerDateCommands({
      taskId,
      originalStartDate: task.startDate.toISOString().slice(0, 10),
      originalEndDate: task.endDate.toISOString().slice(0, 10),
      nextStartDate,
      nextEndDate,
    });

    for (const [index, command] of dateCommands.entries()) {
      const response = await commandService.commitCommand({
        projectId: targetProjectId,
        clientRequestId: `${assignmentId}:${Date.now()}:${index}`,
        baseVersion,
        command,
        history: {
          title: 'Перенос назначения',
          groupId: assignmentId,
          requestContextId: assignmentId,
          origin: 'user_ui',
          finalizeGroup: index === dateCommands.length - 1,
        },
      }, actorType, actorId);

      if (!response.accepted) {
        return reply.status(response.reason === 'version_conflict' ? 409 : 400).send(response);
      }
      baseVersion = response.newVersion;
    }

    let assignments = null as Awaited<ReturnType<typeof assignmentService.replaceForTask>>['assignments'] | null;
    if (fromResourceId !== toResourceId) {
      const currentAssignments = await prisma.taskAssignment.findMany({
        where: { projectId: targetProjectId, taskId },
        select: { resourceId: true },
        orderBy: [{ createdAt: 'asc' }, { resourceId: 'asc' }],
      });
      const resourceIds = currentAssignments
        .map((entry) => (entry.resourceId === fromResourceId ? toResourceId : entry.resourceId))
        .filter((resourceId, index, entries) => resourceId && entries.indexOf(resourceId) === index);
      if (!resourceIds.includes(toResourceId)) {
        resourceIds.push(toResourceId);
      }

      const response = await assignmentService.replaceForTask({
        projectId: targetProjectId,
        taskId,
        resourceIds,
      });
      assignments = response.assignments;
    }

    const planner = await plannerService.getResourcePlanner({
      projectId: req.user!.projectId,
      scope: 'all-projects',
    });

    return reply.send({
      accepted: true,
      projectId: targetProjectId,
      taskId,
      assignments,
      planner,
    });
  });
}
