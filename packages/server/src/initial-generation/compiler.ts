import { createHash } from 'node:crypto';

import type { CreateTaskInput, DependencyType, ProjectCommand } from '@gantt/mcp/types';

import type { ProjectPlan, ProjectPlanDependency, ProjectPlanNode } from './types.js';

type CompileIssueCode =
  | 'invalid_plan'
  | 'duplicate_node_key'
  | 'missing_parent'
  | 'top_level_task'
  | 'invalid_dependency_reference'
  | 'dependency_target_not_task'
  | 'phase_has_dependencies'
  | 'empty_phase'
  | 'cycle_detected';

export type CompileIssue = {
  code: CompileIssueCode;
  message: string;
  nodeKey?: string;
  relatedNodeKeys?: string[];
  dependencyNodeKey?: string;
};

export type CompileDiagnostic = {
  level: 'info' | 'warning';
  code: 'compiled_schedule';
  message: string;
  retainedNodeCount: number;
  compiledTaskCount: number;
  compiledDependencyCount: number;
  topLevelPhaseCount: number;
};

export type CompiledInitialSchedule = {
  projectId: string;
  baseVersion: number;
  serverDate: string;
  command: Extract<ProjectCommand, { type: 'create_tasks_batch' }>;
  nodeKeyToTaskId: Record<string, string>;
  retainedNodeCount: number;
  compiledTaskCount: number;
  compiledDependencyCount: number;
  topLevelPhaseCount: number;
  crossPhaseDependencyCount: number;
  diagnostics: CompileDiagnostic[];
};

export type CompileInitialProjectPlanInput = {
  projectId: string;
  baseVersion: number;
  serverDate: string;
  plan: ProjectPlan;
};

type NormalizedPlanNode = ProjectPlanNode & {
  index: number;
  dependencies: Array<ProjectPlanDependency & { lagDays: number }>;
};

type ScheduledNode = {
  nodeKey: string;
  kind: 'phase' | 'task';
  title: string;
  parentNodeKey?: string;
  startDate: string;
  endDate: string;
  dependencies: Array<{ taskId: string; type: DependencyType; lag: number }>;
};

const WORKING_DAY_MODE = true;

export class InitialPlanCompileError extends Error {
  readonly issues: CompileIssue[];

  constructor(message: string, issues: CompileIssue[]) {
    super(message);
    this.name = 'InitialPlanCompileError';
    this.issues = issues;
  }
}

export function compileInitialProjectPlan(input: CompileInitialProjectPlanInput): CompiledInitialSchedule {
  const normalizedPlan = normalizePlan(input.plan);
  const nodeMap = new Map(normalizedPlan.nodes.map((node) => [node.nodeKey, node]));
  const childMap = buildChildMap(normalizedPlan.nodes);
  const issues = collectStructuralIssues(normalizedPlan.nodes, nodeMap, childMap);

  if (issues.length > 0) {
    throw new InitialPlanCompileError('Project plan failed compiler validation', issues);
  }

  const taskNodes = normalizedPlan.nodes.filter((node) => node.kind === 'task');
  const cycleIssue = detectDependencyCycle(taskNodes);
  if (cycleIssue) {
    throw new InitialPlanCompileError('Project plan contains a dependency cycle', [cycleIssue]);
  }

  const taskSchedule = scheduleTasks(taskNodes, nodeMap, input.serverDate);
  const rolledUpNodes = rollupPhaseDates(normalizedPlan.nodes, childMap, taskSchedule);
  const nodeKeyToTaskId = Object.fromEntries(
    normalizedPlan.nodes.map((node) => [node.nodeKey, buildDeterministicTaskId(input.projectId, node.nodeKey)]),
  );

  const orderedNodes = orderNodes(normalizedPlan.nodes, childMap);
  const commandTasks: CreateTaskInput[] = orderedNodes.map((node, index) => {
    const scheduled = rolledUpNodes.get(node.nodeKey);
    if (!scheduled) {
      throw new InitialPlanCompileError('Project plan rollup failed', [{
        code: 'invalid_plan',
        message: `Missing rolled-up schedule for ${node.nodeKey}`,
        nodeKey: node.nodeKey,
      }]);
    }

    return {
      id: nodeKeyToTaskId[node.nodeKey],
      projectId: input.projectId,
      name: node.title,
      startDate: scheduled.startDate,
      endDate: scheduled.endDate,
      parentId: node.parentNodeKey ? nodeKeyToTaskId[node.parentNodeKey] : undefined,
      dependencies: node.kind === 'task'
        ? node.dependencies.map((dependency) => ({
            taskId: nodeKeyToTaskId[dependency.nodeKey],
            type: dependency.type,
            lag: dependency.lagDays,
          }))
        : [],
      sortOrder: index,
    };
  });

  const compiledTaskCount = commandTasks.filter((task) => Boolean(task.parentId)).length;
  const compiledDependencyCount = commandTasks.reduce((sum, task) => sum + (task.dependencies?.length ?? 0), 0);
  const topLevelPhaseCount = commandTasks.filter((task) => !task.parentId).length;
  const crossPhaseDependencyCount = countCrossPhaseDependencies(orderedNodes, commandTasks, nodeKeyToTaskId);

  return {
    projectId: input.projectId,
    baseVersion: input.baseVersion,
    serverDate: normalizeDateOnly(input.serverDate),
    command: {
      type: 'create_tasks_batch',
      tasks: commandTasks,
    },
    nodeKeyToTaskId,
    retainedNodeCount: normalizedPlan.nodes.length,
    compiledTaskCount,
    compiledDependencyCount,
    topLevelPhaseCount,
    crossPhaseDependencyCount,
    diagnostics: [{
      level: 'info',
      code: 'compiled_schedule',
      message: `Compiled ${normalizedPlan.nodes.length} nodes into one create_tasks_batch command`,
      retainedNodeCount: normalizedPlan.nodes.length,
      compiledTaskCount,
      compiledDependencyCount,
      topLevelPhaseCount,
    }],
  };
}

function countCrossPhaseDependencies(
  orderedNodes: NormalizedPlanNode[],
  commandTasks: CreateTaskInput[],
  nodeKeyToTaskId: Record<string, string>,
): number {
  const nodeMap = new Map(orderedNodes.map((node) => [node.nodeKey, node]));
  const taskIdToNodeKey = new Map(Object.entries(nodeKeyToTaskId).map(([nodeKey, taskId]) => [taskId, nodeKey]));

  const getRootPhaseKey = (node: NormalizedPlanNode): string | null => {
    if (!node.parentNodeKey) {
      return node.kind === 'phase' ? node.nodeKey : null;
    }

    const parent = nodeMap.get(node.parentNodeKey);
    if (!parent) {
      return null;
    }

    return getRootPhaseKey(parent);
  };

  return commandTasks.reduce((count, task) => {
    if (!task.parentId || typeof task.id !== 'string') {
      return count;
    }

    const nodeKey = taskIdToNodeKey.get(task.id);
    if (!nodeKey) {
      return count;
    }

    const node = nodeMap.get(nodeKey);
    if (!node) {
      return count;
    }

    const sourcePhase = getRootPhaseKey(node);
    return count + (task.dependencies ?? []).filter((dependency) => {
      const targetNodeKey = taskIdToNodeKey.get(dependency.taskId);
      if (!targetNodeKey) {
        return false;
      }
      const targetNode = nodeMap.get(targetNodeKey);
      if (!targetNode) {
        return false;
      }

      return sourcePhase !== null && getRootPhaseKey(targetNode) !== sourcePhase;
    }).length;
  }, 0);
}

function normalizePlan(plan: ProjectPlan): { projectType: string; assumptions: string[]; nodes: NormalizedPlanNode[] } {
  if (!plan || typeof plan !== 'object') {
    throw new InitialPlanCompileError('Project plan is not an object', [{
      code: 'invalid_plan',
      message: 'Project plan must be an object',
    }]);
  }

  if (!Array.isArray(plan.nodes)) {
    throw new InitialPlanCompileError('Project plan nodes are missing', [{
      code: 'invalid_plan',
      message: 'Project plan nodes must be an array',
    }]);
  }

  const duplicateGuard = new Set<string>();
  const nodes = plan.nodes.map((node, index) => normalizeNode(node, index, duplicateGuard));

  return {
    projectType: typeof plan.projectType === 'string' ? plan.projectType.trim() : '',
    assumptions: Array.isArray(plan.assumptions) ? plan.assumptions.filter((value): value is string => typeof value === 'string') : [],
    nodes,
  };
}

function normalizeNode(node: ProjectPlanNode, index: number, duplicateGuard: Set<string>): NormalizedPlanNode {
  if (!node || typeof node !== 'object') {
    throw new InitialPlanCompileError('Project plan contains an invalid node', [{
      code: 'invalid_plan',
      message: `Node at index ${index} must be an object`,
    }]);
  }

  const nodeKey = typeof node.nodeKey === 'string' ? node.nodeKey.trim() : '';
  if (!nodeKey) {
    throw new InitialPlanCompileError('Project plan contains a node without nodeKey', [{
      code: 'invalid_plan',
      message: `Node at index ${index} is missing nodeKey`,
    }]);
  }
  if (duplicateGuard.has(nodeKey)) {
    throw new InitialPlanCompileError('Project plan contains duplicate node keys', [{
      code: 'duplicate_node_key',
      message: `Duplicate nodeKey ${nodeKey}`,
      nodeKey,
    }]);
  }
  duplicateGuard.add(nodeKey);

  const title = typeof node.title === 'string' ? node.title.trim() : '';
  if (!title) {
    throw new InitialPlanCompileError('Project plan contains a node without title', [{
      code: 'invalid_plan',
      message: `Node ${nodeKey} is missing title`,
      nodeKey,
    }]);
  }

  if (node.kind !== 'phase' && node.kind !== 'task') {
    throw new InitialPlanCompileError('Project plan contains an invalid node kind', [{
      code: 'invalid_plan',
      message: `Node ${nodeKey} has invalid kind`,
      nodeKey,
    }]);
  }

  if (!Number.isInteger(node.durationDays) || node.durationDays < 1) {
    throw new InitialPlanCompileError('Project plan contains an invalid duration', [{
      code: 'invalid_plan',
      message: `Node ${nodeKey} must have integer durationDays >= 1`,
      nodeKey,
    }]);
  }

  const dependencies = Array.isArray(node.dependsOn)
    ? node.dependsOn.map((dependency, dependencyIndex) => normalizeDependency(nodeKey, dependency, dependencyIndex))
    : [];

  return {
    ...node,
    nodeKey,
    title,
    durationDays: node.durationDays,
    parentNodeKey: typeof node.parentNodeKey === 'string' && node.parentNodeKey.trim()
      ? node.parentNodeKey.trim()
      : undefined,
    dependsOn: dependencies,
    dependencies,
    index,
  };
}

function normalizeDependency(nodeKey: string, dependency: ProjectPlanDependency, dependencyIndex: number) {
  if (!dependency || typeof dependency !== 'object') {
    throw new InitialPlanCompileError('Project plan contains an invalid dependency', [{
      code: 'invalid_plan',
      message: `Node ${nodeKey} dependency ${dependencyIndex} must be an object`,
      nodeKey,
    }]);
  }

  const dependencyNodeKey = typeof dependency.nodeKey === 'string' ? dependency.nodeKey.trim() : '';
  if (!dependencyNodeKey) {
    throw new InitialPlanCompileError('Project plan dependency reference is missing', [{
      code: 'invalid_plan',
      message: `Node ${nodeKey} dependency ${dependencyIndex} is missing nodeKey`,
      nodeKey,
    }]);
  }

  if (dependency.type !== 'FS' && dependency.type !== 'SS' && dependency.type !== 'FF' && dependency.type !== 'SF') {
    throw new InitialPlanCompileError('Project plan contains an invalid dependency type', [{
      code: 'invalid_plan',
      message: `Node ${nodeKey} dependency ${dependencyNodeKey} has invalid type`,
      nodeKey,
      dependencyNodeKey,
    }]);
  }

  if (dependency.lagDays !== undefined && !Number.isInteger(dependency.lagDays)) {
    throw new InitialPlanCompileError('Project plan contains an invalid dependency lag', [{
      code: 'invalid_plan',
      message: `Node ${nodeKey} dependency ${dependencyNodeKey} has non-integer lagDays`,
      nodeKey,
      dependencyNodeKey,
    }]);
  }

  return {
    ...dependency,
    nodeKey: dependencyNodeKey,
    lagDays: dependency.lagDays ?? 0,
  };
}

function buildChildMap(nodes: NormalizedPlanNode[]): Map<string, NormalizedPlanNode[]> {
  const childMap = new Map<string, NormalizedPlanNode[]>();

  for (const node of nodes) {
    if (!node.parentNodeKey) {
      continue;
    }

    const siblings = childMap.get(node.parentNodeKey) ?? [];
    siblings.push(node);
    siblings.sort((left, right) => left.index - right.index);
    childMap.set(node.parentNodeKey, siblings);
  }

  return childMap;
}

function collectStructuralIssues(
  nodes: NormalizedPlanNode[],
  nodeMap: Map<string, NormalizedPlanNode>,
  childMap: Map<string, NormalizedPlanNode[]>,
): CompileIssue[] {
  const issues: CompileIssue[] = [];

  for (const node of nodes) {
    if (node.parentNodeKey) {
      const parent = nodeMap.get(node.parentNodeKey);
      if (!parent) {
        issues.push({
          code: 'missing_parent',
          message: `Node ${node.nodeKey} references missing parent ${node.parentNodeKey}`,
          nodeKey: node.nodeKey,
          relatedNodeKeys: [node.parentNodeKey],
        });
      } else if (parent.kind !== 'phase') {
        issues.push({
          code: 'missing_parent',
          message: `Node ${node.nodeKey} must be nested under a phase container`,
          nodeKey: node.nodeKey,
          relatedNodeKeys: [parent.nodeKey],
        });
      }
    } else if (node.kind === 'task') {
      issues.push({
        code: 'top_level_task',
        message: `Task ${node.nodeKey} cannot exist at the top level`,
        nodeKey: node.nodeKey,
      });
    }

    if (node.kind === 'phase') {
      if (node.dependencies.length > 0) {
        issues.push({
          code: 'phase_has_dependencies',
          message: `Phase ${node.nodeKey} cannot carry dependencies`,
          nodeKey: node.nodeKey,
        });
      }
      if ((childMap.get(node.nodeKey) ?? []).length === 0) {
        issues.push({
          code: 'empty_phase',
          message: `Phase ${node.nodeKey} must retain at least one child`,
          nodeKey: node.nodeKey,
        });
      }
    }

    for (const dependency of node.dependencies) {
      const target = nodeMap.get(dependency.nodeKey);
      if (!target) {
        issues.push({
          code: 'invalid_dependency_reference',
          message: `Node ${node.nodeKey} depends on missing node ${dependency.nodeKey}`,
          nodeKey: node.nodeKey,
          dependencyNodeKey: dependency.nodeKey,
        });
      } else if (target.kind !== 'task') {
        issues.push({
          code: 'dependency_target_not_task',
          message: `Node ${node.nodeKey} depends on non-task node ${dependency.nodeKey}`,
          nodeKey: node.nodeKey,
          dependencyNodeKey: dependency.nodeKey,
        });
      }
    }
  }

  return issues;
}

function detectDependencyCycle(taskNodes: NormalizedPlanNode[]): CompileIssue | null {
  const dependencyMap = new Map(taskNodes.map((node) => [node.nodeKey, node.dependencies.map((dependency) => dependency.nodeKey)]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (nodeKey: string): CompileIssue | null => {
    if (visiting.has(nodeKey)) {
      const cycleStartIndex = stack.indexOf(nodeKey);
      const cyclePath = stack.slice(cycleStartIndex).concat(nodeKey);
      return {
        code: 'cycle_detected',
        message: `Circular dependency detected: ${cyclePath.join(' -> ')}`,
        nodeKey,
        relatedNodeKeys: cyclePath,
      };
    }

    if (visited.has(nodeKey)) {
      return null;
    }

    visiting.add(nodeKey);
    stack.push(nodeKey);

    for (const dependencyKey of dependencyMap.get(nodeKey) ?? []) {
      const issue = visit(dependencyKey);
      if (issue) {
        return issue;
      }
    }

    stack.pop();
    visiting.delete(nodeKey);
    visited.add(nodeKey);
    return null;
  };

  for (const node of taskNodes.sort((left, right) => left.index - right.index)) {
    const issue = visit(node.nodeKey);
    if (issue) {
      return issue;
    }
  }

  return null;
}

function scheduleTasks(
  taskNodes: NormalizedPlanNode[],
  nodeMap: Map<string, NormalizedPlanNode>,
  serverDate: string,
): Map<string, ScheduledNode> {
  const scheduled = new Map<string, ScheduledNode>();
  const anchorDate = alignToWorkingDay(parseDateOnly(serverDate));
  const orderedTasks = topologicalSort(taskNodes, nodeMap);

  for (const node of orderedTasks) {
    const start = resolveTaskStart(node, scheduled, anchorDate);
    const end = addWorkingDuration(start, node.durationDays);
    scheduled.set(node.nodeKey, {
      nodeKey: node.nodeKey,
      kind: 'task',
      title: node.title,
      parentNodeKey: node.parentNodeKey,
      startDate: formatDateOnly(start),
      endDate: formatDateOnly(end),
      dependencies: node.dependencies.map((dependency) => ({
        taskId: dependency.nodeKey,
        type: dependency.type,
        lag: dependency.lagDays,
      })),
    });
  }

  return scheduled;
}

function topologicalSort(taskNodes: NormalizedPlanNode[], nodeMap: Map<string, NormalizedPlanNode>): NormalizedPlanNode[] {
  const ordered: NormalizedPlanNode[] = [];
  const visited = new Set<string>();

  const visit = (node: NormalizedPlanNode): void => {
    if (visited.has(node.nodeKey)) {
      return;
    }

    visited.add(node.nodeKey);
    for (const dependency of node.dependencies) {
      const dependencyNode = nodeMap.get(dependency.nodeKey);
      if (dependencyNode?.kind === 'task') {
        visit(dependencyNode);
      }
    }
    ordered.push(node);
  };

  for (const node of taskNodes.sort((left, right) => left.index - right.index)) {
    visit(node);
  }

  return ordered;
}

function resolveTaskStart(
  node: NormalizedPlanNode,
  scheduled: Map<string, ScheduledNode>,
  anchorDate: Date,
): Date {
  let start = anchorDate;

  for (const dependency of node.dependencies) {
    const predecessor = scheduled.get(dependency.nodeKey);
    if (!predecessor) {
      throw new InitialPlanCompileError('Project plan scheduling failed because a dependency was not scheduled', [{
        code: 'invalid_dependency_reference',
        message: `Dependency ${dependency.nodeKey} for ${node.nodeKey} was not scheduled`,
        nodeKey: node.nodeKey,
        dependencyNodeKey: dependency.nodeKey,
      }]);
    }

    const predecessorStart = parseDateOnly(predecessor.startDate);
    const predecessorEnd = parseDateOnly(predecessor.endDate);
    const candidateStart = resolveDependencyStart(dependency.type, predecessorStart, predecessorEnd, dependency.lagDays, node.durationDays);
    if (candidateStart.getTime() > start.getTime()) {
      start = candidateStart;
    }
  }

  return start;
}

function resolveDependencyStart(
  type: DependencyType,
  predecessorStart: Date,
  predecessorEnd: Date,
  lagDays: number,
  durationDays: number,
): Date {
  switch (type) {
    case 'FS':
      return shiftWorkingDays(predecessorEnd, lagDays + 1);
    case 'SS':
      return shiftWorkingDays(predecessorStart, lagDays);
    case 'FF':
      return buildTaskRangeFromEnd(shiftWorkingDays(predecessorEnd, lagDays), durationDays).start;
    case 'SF':
      return buildTaskRangeFromEnd(shiftWorkingDays(predecessorStart, lagDays - 1), durationDays).start;
  }
}

function rollupPhaseDates(
  nodes: NormalizedPlanNode[],
  childMap: Map<string, NormalizedPlanNode[]>,
  taskSchedule: Map<string, ScheduledNode>,
): Map<string, ScheduledNode> {
  const rolledUp = new Map(taskSchedule);

  const visit = (node: NormalizedPlanNode): ScheduledNode => {
    const existing = rolledUp.get(node.nodeKey);
    if (existing) {
      return existing;
    }

    const children = childMap.get(node.nodeKey) ?? [];
    const childSchedules = children.map((child) => visit(child));
    if (childSchedules.length === 0) {
      throw new InitialPlanCompileError('Project plan phase rollup failed', [{
        code: 'empty_phase',
        message: `Phase ${node.nodeKey} has no children to roll up`,
        nodeKey: node.nodeKey,
      }]);
    }

    let start = parseDateOnly(childSchedules[0].startDate);
    let end = parseDateOnly(childSchedules[0].endDate);
    for (const child of childSchedules.slice(1)) {
      const childStart = parseDateOnly(child.startDate);
      const childEnd = parseDateOnly(child.endDate);
      if (childStart.getTime() < start.getTime()) {
        start = childStart;
      }
      if (childEnd.getTime() > end.getTime()) {
        end = childEnd;
      }
    }

    const rolledUpNode: ScheduledNode = {
      nodeKey: node.nodeKey,
      kind: 'phase',
      title: node.title,
      parentNodeKey: node.parentNodeKey,
      startDate: formatDateOnly(start),
      endDate: formatDateOnly(end),
      dependencies: [],
    };
    rolledUp.set(node.nodeKey, rolledUpNode);
    return rolledUpNode;
  };

  for (const node of nodes.filter((entry) => entry.kind === 'phase').sort((left, right) => right.index - left.index)) {
    visit(node);
  }

  return rolledUp;
}

function orderNodes(nodes: NormalizedPlanNode[], childMap: Map<string, NormalizedPlanNode[]>): NormalizedPlanNode[] {
  const ordered: NormalizedPlanNode[] = [];

  const visit = (node: NormalizedPlanNode): void => {
    ordered.push(node);
    for (const child of childMap.get(node.nodeKey) ?? []) {
      visit(child);
    }
  };

  for (const root of nodes.filter((node) => !node.parentNodeKey).sort((left, right) => left.index - right.index)) {
    visit(root);
  }

  return ordered;
}

function buildDeterministicTaskId(projectId: string, nodeKey: string): string {
  return createHash('sha1').update(`${projectId}:${nodeKey}`).digest('hex').slice(0, 24);
}

function parseDateOnly(value: string): Date {
  const normalized = normalizeDateOnly(value);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new InitialPlanCompileError('Project plan contains an invalid server date', [{
      code: 'invalid_plan',
      message: `Invalid serverDate ${value}`,
    }]);
  }
  return parsed;
}

function normalizeDateOnly(value: string): string {
  return value.split('T')[0]!;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function alignToWorkingDay(date: Date): Date {
  if (!WORKING_DAY_MODE) {
    return date;
  }

  let current = date;
  while (isWeekend(current)) {
    current = addUtcDays(current, 1);
  }
  return current;
}

function addWorkingDuration(startDate: Date, durationDays: number): Date {
  return shiftWorkingDays(startDate, durationDays - 1);
}

function buildTaskRangeFromEnd(endDate: Date, durationDays: number): { start: Date; end: Date } {
  return {
    start: shiftWorkingDays(endDate, -(durationDays - 1)),
    end: endDate,
  };
}

function shiftWorkingDays(date: Date, offset: number): Date {
  let current = alignToWorkingDay(date);
  if (offset === 0) {
    return current;
  }

  let remaining = Math.abs(offset);
  const direction = offset > 0 ? 1 : -1;

  while (remaining > 0) {
    current = addUtcDays(current, direction);
    current = alignBackwardOrForward(current, direction);
    remaining -= 1;
  }

  return current;
}

function alignBackwardOrForward(date: Date, direction: 1 | -1): Date {
  let current = date;
  while (isWeekend(current)) {
    current = addUtcDays(current, direction);
  }
  return current;
}

function addUtcDays(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + delta));
}
