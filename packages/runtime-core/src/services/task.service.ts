/**
 * TaskService - Prisma-backed task read operations
 *
 * Mutations now flow through CommandService. This service remains only for
 * listing and loading task snapshots for read paths.
 */

import { getPrisma } from '../prisma.js';
import type { Task, TaskDependency } from '../types.js';
import { dateToDomain } from './types.js';

export type TaskSearchMatch = {
  taskId: string;
  name: string;
  parentId: string | null;
  path: string[];
  startDate: string;
  endDate: string;
  matchType: 'exact' | 'includes' | 'token';
  score: number;
};

export type GroupScopeMatch = {
  key: string;
  label: string;
  rootTaskId: string;
  memberTaskIds: string[];
  memberNames: string[];
};

type FlatTaskRecord = {
  id: string;
  name: string;
  parentId: string | null;
  projectId: string;
  startDate: Date;
  endDate: Date;
  sortOrder: number;
  childCount?: number;
};

const CONTAINER_KEYWORDS = ['этап', 'phase', 'раздел', 'секция', 'этаж', 'корпус'];
const GROUP_KEYWORDS = ['этаж', 'секция', 'корпус', 'блок', 'floor', 'section', 'building', 'zone'];

export class TaskService {
  private _prisma: ReturnType<typeof getPrisma> | undefined;

  private get prisma() {
    if (!this._prisma) {
      this._prisma = getPrisma();
    }
    return this._prisma;
  }

  private taskToDomain(task: any, dependencies: TaskDependency[] = []): Task {
    return {
      id: task.id,
      name: task.name,
      startDate: dateToDomain(task.startDate),
      endDate: dateToDomain(task.endDate),
      type: task.type ?? 'task',
      color: task.color || undefined,
      parentId: task.parentId || undefined,
      progress: task.progress,
      dependencies,
      sortOrder: task.sortOrder,
    };
  }

  private normalizeSearchText(value: string): string {
    return value
      .toLowerCase()
      .replace(/["'«»]/g, ' ')
      .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenizeSearchText(value: string): string[] {
    return this.normalizeSearchText(value)
      .split(' ')
      .filter((token) => token.length > 1);
  }

  private async loadProjectTaskRecords(projectId: string): Promise<FlatTaskRecord[]> {
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        parentId: true,
        projectId: true,
        startDate: true,
        endDate: true,
        sortOrder: true,
        _count: {
          select: {
            children: true,
          },
        },
      },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    return tasks.map((task) => ({
      id: task.id,
      name: task.name,
      parentId: task.parentId,
      projectId: task.projectId,
      startDate: task.startDate,
      endDate: task.endDate,
      sortOrder: task.sortOrder,
      childCount: task._count.children,
    }));
  }

  private buildTaskPath(taskId: string, taskMap: Map<string, FlatTaskRecord>): string[] {
    const path: string[] = [];
    let current = taskMap.get(taskId);

    while (current) {
      path.unshift(current.name);
      current = current.parentId ? taskMap.get(current.parentId) : undefined;
    }

    return path;
  }

  private buildSearchMatches(tasks: FlatTaskRecord[], query: string, limit: number): TaskSearchMatch[] {
    const normalizedQuery = this.normalizeSearchText(query);
    const queryTokens = this.tokenizeSearchText(query);
    const taskMap = new Map(tasks.map((task) => [task.id, task]));

    return tasks
      .map((task) => {
        const normalizedName = this.normalizeSearchText(task.name);
        const normalizedPath = this.buildTaskPath(task.id, taskMap).map((part) => this.normalizeSearchText(part)).join(' / ');
        let matchType: TaskSearchMatch['matchType'] | null = null;
        let score = 0;

        if (normalizedName === normalizedQuery) {
          matchType = 'exact';
          score = 1;
        } else if (normalizedName.includes(normalizedQuery) || normalizedPath.includes(normalizedQuery)) {
          matchType = 'includes';
          score = 0.8;
        } else if (queryTokens.length > 0 && queryTokens.every((token) => normalizedPath.includes(token))) {
          matchType = 'token';
          score = 0.66 + Math.min(0.18, queryTokens.length * 0.04);
        }

        if (!matchType) {
          return null;
        }

        return {
          taskId: task.id,
          name: task.name,
          parentId: task.parentId,
          path: this.buildTaskPath(task.id, taskMap),
          startDate: dateToDomain(task.startDate),
          endDate: dateToDomain(task.endDate),
          matchType,
          score,
        } satisfies TaskSearchMatch;
      })
      .filter((match): match is TaskSearchMatch => Boolean(match))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        if (left.matchType !== right.matchType) {
          return left.matchType.localeCompare(right.matchType);
        }
        return left.path.join('/').localeCompare(right.path.join('/'));
      })
      .slice(0, limit);
  }

  /**
   * List tasks by project ID with pagination.
   */
  async list(
    projectId?: string,
    parentId?: string | null,
    limit: number = 100,
    offset: number = 0,
  ): Promise<{ tasks: Task[]; hasMore: boolean; total: number }> {
    if (limit < 1 || limit > 1000) {
      throw new Error('limit must be between 1 and 1000');
    }
    if (offset < 0) {
      throw new Error('offset must be >= 0');
    }

    const whereClause: Record<string, unknown> = {};
    if (projectId) whereClause.projectId = projectId;
    if (parentId !== undefined) whereClause.parentId = parentId;

    const where = Object.keys(whereClause).length > 0 ? whereClause : undefined;

    const total = await this.prisma.task.count({ where });
    const tasks = await this.prisma.task.findMany({
      where,
      include: { dependencies: true },
      orderBy: { sortOrder: 'asc' },
      take: limit,
      skip: offset,
    });

    return {
      tasks: tasks.map((task) => this.taskToDomain(
        task,
        task.dependencies.map((dependency) => ({
          taskId: dependency.depTaskId,
          type: dependency.type as TaskDependency['type'],
          lag: dependency.lag,
        })),
      )),
      hasMore: offset + limit < total,
      total,
    };
  }

  /**
   * Get a task by ID with dependencies and optional children.
   */
  async get(id: string, includeChildren: boolean | 'shallow' | 'deep' = false): Promise<Task | undefined> {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { dependencies: true },
    });

    if (!task) return undefined;

    const result = this.taskToDomain(
      task,
      task.dependencies.map((dependency) => ({
        taskId: dependency.depTaskId,
        type: dependency.type as TaskDependency['type'],
        lag: dependency.lag,
      })),
    );

    if (includeChildren === false) {
      return result;
    }

    const childTasks = await this.prisma.task.findMany({
      where: { parentId: id },
      include: { dependencies: true },
      orderBy: { sortOrder: 'asc' },
    });

    const children = childTasks.map((child) => this.taskToDomain(
      child,
      child.dependencies.map((dependency) => ({
        taskId: dependency.depTaskId,
        type: dependency.type as TaskDependency['type'],
        lag: dependency.lag,
      })),
    ));

    if (includeChildren === 'deep') {
      for (const child of children) {
        const nested = await this.get(child.id, 'deep');
        if (nested?.children) {
          child.children = nested.children;
        }
      }
    }

    if (children.length > 0) {
      result.children = children;
    }

    return result;
  }

  async findTasksByName(projectId: string, query: string, limit = 8): Promise<TaskSearchMatch[]> {
    if (!query.trim()) {
      return [];
    }

    const tasks = await this.loadProjectTaskRecords(projectId);
    return this.buildSearchMatches(tasks, query, limit);
  }

  async findContainerCandidates(projectId: string, query: string, limit = 8): Promise<TaskSearchMatch[]> {
    const tasks = await this.loadProjectTaskRecords(projectId);
    const filtered = tasks.filter((task) => {
      const normalizedName = this.normalizeSearchText(task.name);
      return (task.childCount ?? 0) > 0 || CONTAINER_KEYWORDS.some((keyword) => normalizedName.includes(keyword));
    });

    return this.buildSearchMatches(filtered, query, limit);
  }

  async listBranchTasks(projectId: string, rootTaskId: string): Promise<TaskSearchMatch[]> {
    const tasks = await this.loadProjectTaskRecords(projectId);
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    if (!taskMap.has(rootTaskId)) {
      return [];
    }

    const childrenByParent = new Map<string | null, FlatTaskRecord[]>();
    for (const task of tasks) {
      const key = task.parentId ?? null;
      const bucket = childrenByParent.get(key) ?? [];
      bucket.push(task);
      childrenByParent.set(key, bucket);
    }

    const branch: FlatTaskRecord[] = [];
    const queue = [rootTaskId];
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) {
        continue;
      }

      const current = taskMap.get(currentId);
      if (!current) {
        continue;
      }

      branch.push(current);
      const children = (childrenByParent.get(current.id) ?? []).sort((left, right) => left.sortOrder - right.sortOrder);
      for (const child of children) {
        queue.push(child.id);
      }
    }

    return branch.map((task) => ({
      taskId: task.id,
      name: task.name,
      parentId: task.parentId,
      path: this.buildTaskPath(task.id, taskMap),
      startDate: dateToDomain(task.startDate),
      endDate: dateToDomain(task.endDate),
      matchType: task.id === rootTaskId ? 'exact' : 'token',
      score: task.id === rootTaskId ? 1 : 0.6,
    }));
  }

  async findGroupScopes(projectId: string, hint: string): Promise<GroupScopeMatch[]> {
    const normalizedHint = this.normalizeSearchText(hint);
    const matchedKeyword = GROUP_KEYWORDS.find((keyword) => normalizedHint.includes(keyword));
    if (!matchedKeyword) {
      return [];
    }

    const tasks = await this.loadProjectTaskRecords(projectId);
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const groups = new Map<string, FlatTaskRecord[]>();

    for (const task of tasks) {
      const normalizedName = this.normalizeSearchText(task.name);
      if (!normalizedName.includes(matchedKeyword)) {
        continue;
      }

      const groupKey = task.parentId ?? '__root__';
      const bucket = groups.get(groupKey) ?? [];
      bucket.push(task);
      groups.set(groupKey, bucket);
    }

    return Array.from(groups.entries())
      .filter(([, members]) => members.length >= 2)
      .map(([parentId, members]) => {
        const parent = parentId === '__root__' ? undefined : taskMap.get(parentId);
        return {
          key: matchedKeyword,
          label: parent?.name ?? members[0]?.name.split(/\s+/u)[0] ?? matchedKeyword,
          rootTaskId: parent?.id ?? members[0]!.id,
          memberTaskIds: members.map((member) => member.id),
          memberNames: members.map((member) => member.name),
        } satisfies GroupScopeMatch;
      });
  }
}

export const taskService = new TaskService();
