import { createHash } from 'node:crypto';

import {
  buildTaskRangeFromStart,
  recalculateTaskFromDependencies,
  parseDateOnly as parseCoreDateOnly,
  type Task as CoreTask,
} from 'gantt-lib/core/scheduling';
import type { CreateTaskInput, DependencyType, ProjectCommand, ScheduleCommandOptions } from '@gantt/mcp/types';

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

export type CompiledInitialStructure = {
  projectId: string;
  baseVersion: number;
  serverDate: string;
  nodes: NormalizedPlanNode[];
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
  kind: 'phase' | 'subphase' | 'task';
  title: string;
  parentNodeKey?: string;
  startDate: string;
  endDate: string;
  dependencies: Array<{ taskId: string; type: DependencyType; lag: number }>;
};

const WORKING_DAY_MODE = true;
const DEFAULT_WEEKEND_PREDICATE = (date: Date): boolean => {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
};

export class InitialPlanCompileError extends Error {
  readonly issues: CompileIssue[];

  constructor(message: string, issues: CompileIssue[]) {
    super(message);
    this.name = 'InitialPlanCompileError';
    this.issues = issues;
  }
}

export function compileInitialProjectPlan(input: CompileInitialProjectPlanInput): CompiledInitialStructure {
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

  const nodeKeyToTaskId = Object.fromEntries(
    normalizedPlan.nodes.map((node) => [node.nodeKey, buildDeterministicTaskId(input.projectId, node.nodeKey)]),
  );

  const compiledTaskCount = normalizedPlan.nodes.filter((node) => node.kind === 'task').length;
  const compiledDependencyCount = taskNodes.reduce((sum, node) => sum + node.dependencies.length, 0);
  const topLevelPhaseCount = normalizedPlan.nodes.filter((node) => node.kind === 'phase' && !node.parentNodeKey).length;
  const crossPhaseDependencyCount = countCrossPhaseDependencies(normalizedPlan.nodes);

  return {
    projectId: input.projectId,
    baseVersion: input.baseVersion,
    serverDate: normalizeDateOnly(input.serverDate),
    nodes: normalizedPlan.nodes,
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
): number {
  const nodeMap = new Map(orderedNodes.map((node) => [node.nodeKey, node]));

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

  return orderedNodes.reduce((count, node) => {
    if (node.kind !== 'task') {
      return count;
    }

    const sourcePhase = getRootPhaseKey(node);
    return count + node.dependencies.filter((dependency) => {
      const targetNode = nodeMap.get(dependency.nodeKey);
      if (!targetNode) {
        return false;
      }

      return sourcePhase !== null && getRootPhaseKey(targetNode) !== sourcePhase;
    }).length;
  }, 0);
}

export function materializeInitialProjectPlan(
  structure: CompiledInitialStructure,
  scheduleOptions?: Pick<ScheduleCommandOptions, 'businessDays' | 'weekendPredicate'>,
): CompiledInitialSchedule {
  const childMap = buildChildMap(structure.nodes);
  const nodeMap = new Map(structure.nodes.map((node) => [node.nodeKey, node]));
  const taskNodes = structure.nodes.filter((node) => node.kind === 'task');
  const taskSchedule = scheduleTasks(taskNodes, nodeMap, structure.serverDate, scheduleOptions);
  const rolledUpNodes = rollupPhaseDates(structure.nodes, childMap, taskSchedule);
  const orderedNodes = orderNodes(structure.nodes, childMap);
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
      id: structure.nodeKeyToTaskId[node.nodeKey],
      projectId: structure.projectId,
      name: node.title,
      startDate: scheduled.startDate,
      endDate: scheduled.endDate,
      parentId: node.parentNodeKey ? structure.nodeKeyToTaskId[node.parentNodeKey] : undefined,
      dependencies: node.kind === 'task'
        ? node.dependencies.map((dependency) => ({
            taskId: structure.nodeKeyToTaskId[dependency.nodeKey],
            type: dependency.type,
            lag: dependency.lagDays,
          }))
        : [],
      sortOrder: index,
    };
  });

  return {
    ...structure,
    command: {
      type: 'create_tasks_batch',
      tasks: commandTasks,
    },
  };
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

  if (node.kind !== 'phase' && node.kind !== 'subphase' && node.kind !== 'task') {
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
      } else if (node.kind === 'subphase' && parent.kind !== 'phase') {
        issues.push({
          code: 'missing_parent',
          message: `Subphase ${node.nodeKey} must be nested under a phase container`,
          nodeKey: node.nodeKey,
          relatedNodeKeys: [parent.nodeKey],
        });
      } else if (node.kind === 'task' && parent.kind !== 'subphase') {
        issues.push({
          code: 'missing_parent',
          message: `Task ${node.nodeKey} must be nested under a subphase container`,
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

    if (node.kind === 'phase' || node.kind === 'subphase') {
      if (node.dependencies.length > 0) {
        issues.push({
          code: 'phase_has_dependencies',
          message: `${node.kind === 'phase' ? 'Phase' : 'Subphase'} ${node.nodeKey} cannot carry dependencies`,
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
  scheduleOptions?: Pick<ScheduleCommandOptions, 'businessDays' | 'weekendPredicate'>,
): Map<string, ScheduledNode> {
  const scheduled = new Map<string, ScheduledNode>();
  const anchorDate = parseCoreDateOnly(normalizeDateOnly(serverDate));
  const orderedTasks = topologicalSort(taskNodes, nodeMap);
  let workingSnapshot: CoreTask[] = [];
  const businessDays = scheduleOptions?.businessDays ?? WORKING_DAY_MODE;
  const weekendPredicate = businessDays
    ? (scheduleOptions?.weekendPredicate ?? DEFAULT_WEEKEND_PREDICATE)
    : undefined;

  for (const node of orderedTasks) {
    const anchorRange = buildTaskRangeFromStart(
      anchorDate,
      node.durationDays,
      businessDays,
      weekendPredicate,
    );
    const seedTask: CoreTask = {
      id: node.nodeKey,
      name: node.title,
      startDate: formatDateOnly(anchorRange.start),
      endDate: formatDateOnly(anchorRange.end),
      parentId: node.parentNodeKey,
      dependencies: node.dependencies.map((dependency) => ({
        taskId: dependency.nodeKey,
        type: dependency.type,
        lag: dependency.lagDays,
      })),
    };

    workingSnapshot = [...workingSnapshot, seedTask];

    const changedTask = node.dependencies.length > 0
      ? recalculateTaskFromDependencies(
          node.nodeKey,
          workingSnapshot,
          {
            businessDays,
            weekendPredicate,
          },
        ).changedTasks.find((task) => task.id === node.nodeKey)
      : seedTask;

    if (!changedTask) {
      throw new InitialPlanCompileError('Project plan scheduling failed because a dependency was not scheduled', [{
        code: 'invalid_dependency_reference',
        message: `Task ${node.nodeKey} could not be scheduled through the core scheduler`,
        nodeKey: node.nodeKey,
      }]);
    }

    workingSnapshot = workingSnapshot.map((task) => (
      task.id === changedTask.id ? changedTask : task
    ));

    scheduled.set(node.nodeKey, {
      nodeKey: node.nodeKey,
      kind: 'task',
      title: node.title,
      parentNodeKey: node.parentNodeKey,
      startDate: typeof changedTask.startDate === 'string' ? changedTask.startDate : formatDateOnly(changedTask.startDate),
      endDate: typeof changedTask.endDate === 'string' ? changedTask.endDate : formatDateOnly(changedTask.endDate),
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
      kind: node.kind,
      title: node.title,
      parentNodeKey: node.parentNodeKey,
      startDate: formatDateOnly(start),
      endDate: formatDateOnly(end),
      dependencies: [],
    };
    rolledUp.set(node.nodeKey, rolledUpNode);
    return rolledUpNode;
  };

  for (const node of nodes.filter((entry) => entry.kind === 'phase' || entry.kind === 'subphase').sort((left, right) => right.index - left.index)) {
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

export function buildDeterministicTaskId(projectId: string, nodeKey: string): string {
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

function addUtcDays(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + delta));
}
