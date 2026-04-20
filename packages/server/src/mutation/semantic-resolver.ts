import type {
  ResolvedSemanticMutationPlan,
  ResolvedSemanticOperation,
  SemanticMutationPlan,
  SemanticPlanAmbiguity,
} from './semantic-types.js';

type TaskSearchMatch = {
  taskId: string;
  name: string;
  parentId: string | null;
  path: string[];
  startDate: string;
  endDate: string;
  matchType: 'exact' | 'includes' | 'token';
  score: number;
};

type MutationResolverTaskService = {
  list(projectId: string): Promise<{ tasks: Array<{ id: string; name: string; parentId?: string; startDate?: string; endDate?: string }> }>;
  findTasksByName(projectId: string, query: string, limit?: number): Promise<TaskSearchMatch[]>;
  findContainerCandidates(projectId: string, query: string, limit?: number): Promise<TaskSearchMatch[]>;
  listBranchTasks(projectId: string, rootTaskId: string): Promise<TaskSearchMatch[]>;
};

export type ResolveSemanticMutationInput = {
  projectId: string;
  plan: SemanticMutationPlan;
  taskService: MutationResolverTaskService;
};

type ResolutionMatch = {
  id: string;
  parentId: string | null;
  score: number;
};

function parseComparableDate(value?: string): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function pickBestTaskMatch(matches: TaskSearchMatch[]): TaskSearchMatch | null {
  const exact = matches.find((match) => match.matchType === 'exact');
  return exact ?? matches[0] ?? null;
}

function hasTiedTopScores(matches: TaskSearchMatch[]): boolean {
  if (matches.length < 2) {
    return false;
  }

  return matches[0]?.score === matches[1]?.score;
}

function toResolutionMatch(match: TaskSearchMatch | null): ResolutionMatch | null {
  if (!match) {
    return null;
  }

  return {
    id: match.taskId,
    parentId: match.parentId ?? null,
    score: match.score,
  };
}

function pickTailTaskWithinContainer(
  containerId: string,
  branchMatches: TaskSearchMatch[],
): TaskSearchMatch | null {
  const descendants = branchMatches.filter((match) => match.taskId !== containerId);
  if (descendants.length === 0) {
    return null;
  }

  const parentIds = new Set(
    descendants
      .map((match) => match.parentId)
      .filter((value): value is string => Boolean(value)),
  );

  const leafCandidates = descendants.filter((match) => !parentIds.has(match.taskId));
  const rankingPool = leafCandidates.length > 0 ? leafCandidates : descendants;

  return [...rankingPool].sort((left, right) => {
    const endDiff = parseComparableDate(right.endDate) - parseComparableDate(left.endDate);
    if (endDiff !== 0) {
      return endDiff;
    }

    const startDiff = parseComparableDate(right.startDate) - parseComparableDate(left.startDate);
    if (startDiff !== 0) {
      return startDiff;
    }

    return left.name.localeCompare(right.name);
  })[0] ?? null;
}

async function resolveTaskHint(
  taskService: MutationResolverTaskService,
  projectId: string,
  hint: string,
): Promise<{ ambiguity: SemanticPlanAmbiguity; explanation?: string; match: ResolutionMatch | null }> {
  const matches = await taskService.findTasksByName(projectId, hint, 8);
  if (matches.length === 0) {
    return {
      ambiguity: 'low_confidence_target',
      explanation: `Could not resolve task hint "${hint}".`,
      match: null,
    };
  }

  if (hasTiedTopScores(matches)) {
    return {
      ambiguity: 'low_confidence_target',
      explanation: `Multiple tasks tie for "${hint}".`,
      match: null,
    };
  }

  return {
    ambiguity: 'none',
    match: toResolutionMatch(pickBestTaskMatch(matches)),
  };
}

async function resolveContainerHint(
  taskService: MutationResolverTaskService,
  projectId: string,
  hint: string,
): Promise<{ ambiguity: SemanticPlanAmbiguity; explanation?: string; match: ResolutionMatch | null }> {
  const containerMatches = await taskService.findContainerCandidates(projectId, hint, 8);
  if (containerMatches.length === 0) {
    return {
      ambiguity: 'missing_anchor',
      explanation: `Could not resolve container hint "${hint}".`,
      match: null,
    };
  }

  if (hasTiedTopScores(containerMatches)) {
    return {
      ambiguity: 'low_confidence_target',
      explanation: `Multiple containers tie for "${hint}".`,
      match: null,
    };
  }

  return {
    ambiguity: 'none',
    match: toResolutionMatch(pickBestTaskMatch(containerMatches)),
  };
}

export async function resolveSemanticMutationPlan(
  input: ResolveSemanticMutationInput,
): Promise<ResolvedSemanticMutationPlan> {
  const resolvedOperations: ResolvedSemanticOperation[] = [];
  const confidences: number[] = [];

  for (const operation of input.plan.operations) {
    switch (operation.action) {
      case 'change_duration': {
        const resolvedTarget = await resolveTaskHint(input.taskService, input.projectId, operation.targetHint);
        if (resolvedTarget.ambiguity !== 'none' || !resolvedTarget.match) {
          return {
            ambiguity: resolvedTarget.ambiguity,
            explanation: resolvedTarget.explanation,
            confidence: 0,
            operations: [],
          };
        }

        confidences.push(resolvedTarget.match.score);
        resolvedOperations.push({
          action: 'change_duration',
          targetHint: operation.targetHint,
          targetId: resolvedTarget.match.id,
          durationMode: operation.durationMode,
          durationValue: operation.durationValue,
          anchor: operation.anchor ?? 'end',
        });
        break;
      }

      case 'add_task': {
        if (operation.placement.mode === 'after' || operation.placement.mode === 'before') {
          if (!operation.placement.anchorHint) {
            return {
              ambiguity: 'missing_anchor',
              explanation: 'Add-task placement requires an anchorHint for before/after mode.',
              confidence: 0,
              operations: [],
            };
          }

          const resolvedAnchor = await resolveTaskHint(input.taskService, input.projectId, operation.placement.anchorHint);
          if (resolvedAnchor.ambiguity !== 'none' || !resolvedAnchor.match) {
            return {
              ambiguity: resolvedAnchor.ambiguity,
              explanation: resolvedAnchor.explanation,
              confidence: 0,
              operations: [],
            };
          }

          let parentId = resolvedAnchor.match.parentId;
          if (operation.placement.parentHint) {
            const resolvedParent = await resolveContainerHint(input.taskService, input.projectId, operation.placement.parentHint);
            if (resolvedParent.ambiguity !== 'none' || !resolvedParent.match) {
              return {
                ambiguity: resolvedParent.ambiguity,
                explanation: resolvedParent.explanation,
                confidence: 0,
                operations: [],
              };
            }
            parentId = resolvedParent.match.id;
            confidences.push(resolvedParent.match.score);
          }

          confidences.push(resolvedAnchor.match.score);
          resolvedOperations.push({
            action: 'add_task',
            title: operation.title,
            taskType: operation.taskType,
            durationDays: operation.durationDays ?? 1,
            placement: {
              mode: operation.placement.mode,
              anchorTaskId: resolvedAnchor.match.id,
              parentId,
            },
          });
          break;
        }

        if (!operation.placement.parentHint) {
          return {
            ambiguity: 'missing_anchor',
            explanation: 'Add-task inside_tail placement requires a parentHint.',
            confidence: 0,
            operations: [],
          };
        }

        const resolvedParent = await resolveContainerHint(input.taskService, input.projectId, operation.placement.parentHint);
        if (resolvedParent.ambiguity !== 'none' || !resolvedParent.match) {
          return {
            ambiguity: resolvedParent.ambiguity,
            explanation: resolvedParent.explanation,
            confidence: 0,
            operations: [],
          };
        }

        const branchMatches = await input.taskService.listBranchTasks(input.projectId, resolvedParent.match.id);
        const tailTask = pickTailTaskWithinContainer(resolvedParent.match.id, branchMatches);
        confidences.push(resolvedParent.match.score);
        resolvedOperations.push({
          action: 'add_task',
          title: operation.title,
          taskType: operation.taskType,
          durationDays: operation.durationDays ?? 1,
          placement: {
            mode: 'inside_tail',
            anchorTaskId: tailTask?.taskId,
            parentId: resolvedParent.match.id,
          },
        });
        break;
      }

      case 'move_task': {
        const resolvedTarget = await resolveTaskHint(input.taskService, input.projectId, operation.targetHint);
        if (resolvedTarget.ambiguity !== 'none' || !resolvedTarget.match) {
          return {
            ambiguity: resolvedTarget.ambiguity,
            explanation: resolvedTarget.explanation,
            confidence: 0,
            operations: [],
          };
        }

        confidences.push(resolvedTarget.match.score);
        if (operation.moveMode === 'to_parent') {
          if (!operation.parentHint) {
            return {
              ambiguity: 'missing_anchor',
              explanation: 'move_task to_parent requires parentHint.',
              confidence: 0,
              operations: [],
            };
          }

          const resolvedParent = await resolveContainerHint(input.taskService, input.projectId, operation.parentHint);
          if (resolvedParent.ambiguity !== 'none' || !resolvedParent.match) {
            return {
              ambiguity: resolvedParent.ambiguity,
              explanation: resolvedParent.explanation,
              confidence: 0,
              operations: [],
            };
          }

          confidences.push(resolvedParent.match.score);
          resolvedOperations.push({
            action: 'move_task',
            targetHint: operation.targetHint,
            targetId: resolvedTarget.match.id,
            moveMode: 'to_parent',
            parentId: resolvedParent.match.id,
          });
          break;
        }

        resolvedOperations.push({
          action: 'move_task',
          targetHint: operation.targetHint,
          targetId: resolvedTarget.match.id,
          moveMode: operation.moveMode,
          targetDate: operation.targetDate,
          deltaDays: operation.deltaDays,
        });
        break;
      }

      case 'rename_task': {
        const resolvedTarget = await resolveTaskHint(input.taskService, input.projectId, operation.targetHint);
        if (resolvedTarget.ambiguity !== 'none' || !resolvedTarget.match) {
          return {
            ambiguity: resolvedTarget.ambiguity,
            explanation: resolvedTarget.explanation,
            confidence: 0,
            operations: [],
          };
        }

        confidences.push(resolvedTarget.match.score);
        resolvedOperations.push({
          action: 'rename_task',
          targetHint: operation.targetHint,
          targetId: resolvedTarget.match.id,
          newTitle: operation.newTitle,
        });
        break;
      }

      case 'delete_task': {
        const resolvedTarget = await resolveTaskHint(input.taskService, input.projectId, operation.targetHint);
        if (resolvedTarget.ambiguity !== 'none' || !resolvedTarget.match) {
          return {
            ambiguity: resolvedTarget.ambiguity,
            explanation: resolvedTarget.explanation,
            confidence: 0,
            operations: [],
          };
        }

        confidences.push(resolvedTarget.match.score);
        resolvedOperations.push({
          action: 'delete_task',
          targetHint: operation.targetHint,
          targetId: resolvedTarget.match.id,
        });
        break;
      }

      case 'link_tasks':
      case 'unlink_tasks': {
        const predecessor = await resolveTaskHint(input.taskService, input.projectId, operation.predecessorHint);
        if (predecessor.ambiguity !== 'none' || !predecessor.match) {
          return {
            ambiguity: predecessor.ambiguity,
            explanation: predecessor.explanation,
            confidence: 0,
            operations: [],
          };
        }

        const successor = await resolveTaskHint(input.taskService, input.projectId, operation.successorHint);
        if (successor.ambiguity !== 'none' || !successor.match) {
          return {
            ambiguity: successor.ambiguity,
            explanation: successor.explanation,
            confidence: 0,
            operations: [],
          };
        }

        confidences.push(predecessor.match.score, successor.match.score);
        if (operation.action === 'link_tasks') {
          resolvedOperations.push({
            action: 'link_tasks',
            predecessorHint: operation.predecessorHint,
            predecessorId: predecessor.match.id,
            successorHint: operation.successorHint,
            successorId: successor.match.id,
            dependencyType: operation.dependencyType ?? 'FS',
            lagDays: operation.lagDays,
          });
        } else {
          resolvedOperations.push({
            action: 'unlink_tasks',
            predecessorHint: operation.predecessorHint,
            predecessorId: predecessor.match.id,
            successorHint: operation.successorHint,
            successorId: successor.match.id,
          });
        }
        break;
      }

      case 'move_in_hierarchy': {
        const resolvedTarget = await resolveTaskHint(input.taskService, input.projectId, operation.targetHint);
        if (resolvedTarget.ambiguity !== 'none' || !resolvedTarget.match) {
          return {
            ambiguity: resolvedTarget.ambiguity,
            explanation: resolvedTarget.explanation,
            confidence: 0,
            operations: [],
          };
        }

        let parentId: string | null = null;
        if (operation.parentHint !== null) {
          const resolvedParent = await resolveContainerHint(input.taskService, input.projectId, operation.parentHint);
          if (resolvedParent.ambiguity !== 'none' || !resolvedParent.match) {
            return {
              ambiguity: resolvedParent.ambiguity,
              explanation: resolvedParent.explanation,
              confidence: 0,
              operations: [],
            };
          }
          parentId = resolvedParent.match.id;
          confidences.push(resolvedParent.match.score);
        }

        confidences.push(resolvedTarget.match.score);
        resolvedOperations.push({
          action: 'move_in_hierarchy',
          targetHint: operation.targetHint,
          targetId: resolvedTarget.match.id,
          parentId,
        });
        break;
      }
    }
  }

  const confidence = confidences.length > 0
    ? Math.min(...confidences)
    : 0;

  return {
    ambiguity: 'none',
    confidence,
    operations: resolvedOperations,
  };
}

