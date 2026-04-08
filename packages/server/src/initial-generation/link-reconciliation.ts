import { evaluateProjectPlanQuality } from './quality-gate.js';
import type {
  CrossPhaseLink,
  CrossPhaseLinkPlan,
  ExecutableProjectPlan,
  ExpandedPhasePlan,
  ExpandedPhaseTask,
  GenerationBrief,
  PlanQualityVerdict,
  ProjectPlanDependency,
  ProjectWbsSkeleton,
  SkeletonPhase,
} from './types.js';

export type BuildExecutablePlanInput = {
  brief: GenerationBrief;
  skeleton: ProjectWbsSkeleton;
  expansions: ExpandedPhasePlan[];
};

export type BuildExecutablePlanResult = {
  plan: ExecutableProjectPlan;
  crossPhaseLinkPlan: CrossPhaseLinkPlan;
  verdict: PlanQualityVerdict;
};

function getEntryTasks(expansion: ExpandedPhasePlan): ExpandedPhaseTask[] {
  const dependedOnKeys = new Set(expansion.tasks.flatMap((task) => task.dependsOnWithinPhase.map((dependency) => dependency.nodeKey)));
  const explicitEntries = expansion.tasks.filter((task) => task.sequenceRole === 'entry');
  if (explicitEntries.length > 0) {
    return explicitEntries;
  }
  return expansion.tasks.filter((task) => task.dependsOnWithinPhase.length === 0 || !dependedOnKeys.has(task.nodeKey));
}

function getExitTasks(expansion: ExpandedPhasePlan): ExpandedPhaseTask[] {
  const dependencyTargets = new Set(expansion.tasks.flatMap((task) => task.dependsOnWithinPhase.map((dependency) => dependency.nodeKey)));
  const explicitExits = expansion.tasks.filter((task) => task.sequenceRole === 'exit');
  if (explicitExits.length > 0) {
    return explicitExits;
  }
  return expansion.tasks.filter((task) => !dependencyTargets.has(task.nodeKey));
}

function createCrossPhaseLinks(
  orderedPhases: SkeletonPhase[],
  expansionsByPhaseKey: Map<string, ExpandedPhasePlan>,
): CrossPhaseLinkPlan {
  const links: CrossPhaseLink[] = [];

  for (let index = 0; index < orderedPhases.length; index += 1) {
    const phase = orderedPhases[index]!;
    const currentExpansion = expansionsByPhaseKey.get(phase.phaseKey);
    if (!currentExpansion) {
      continue;
    }

    const predecessorPhaseKeys = phase.dependsOnPhaseKeys?.length
      ? phase.dependsOnPhaseKeys
      : index > 0
        ? [orderedPhases[index - 1]!.phaseKey]
        : [];

    const entryTasks = getEntryTasks(currentExpansion);
    for (const predecessorPhaseKey of predecessorPhaseKeys) {
      const predecessorExpansion = expansionsByPhaseKey.get(predecessorPhaseKey);
      if (!predecessorExpansion) {
        continue;
      }
      const exitTasks = getExitTasks(predecessorExpansion);
      for (const exitTask of exitTasks) {
        for (const entryTask of entryTasks) {
          links.push({
            fromNodeKey: exitTask.nodeKey,
            toNodeKey: entryTask.nodeKey,
            type: 'FS',
            lagDays: 0,
          });
        }
      }
    }
  }

  return {
    links: dedupeLinks(links),
  };
}

function dedupeLinks(links: CrossPhaseLink[]): CrossPhaseLink[] {
  const seen = new Set<string>();
  const deduped: CrossPhaseLink[] = [];
  for (const link of links) {
    const signature = `${link.fromNodeKey}:${link.toNodeKey}:${link.type}:${link.lagDays ?? 0}`;
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    deduped.push(link);
  }
  return deduped;
}

function mergeDependencies(
  taskNodeKey: string,
  withinPhase: ProjectPlanDependency[],
  crossPhaseLinkPlan: CrossPhaseLinkPlan,
): ProjectPlanDependency[] {
  const crossPhaseDependencies = crossPhaseLinkPlan.links
    .filter((link) => link.toNodeKey === taskNodeKey)
    .map((link) => ({
      nodeKey: link.fromNodeKey,
      type: link.type,
      lagDays: link.lagDays ?? 0,
    }));

  return [...withinPhase, ...crossPhaseDependencies];
}

export function buildExecutablePlan(input: BuildExecutablePlanInput): BuildExecutablePlanResult {
  const orderedPhases = [...input.skeleton.phases].sort((left, right) => left.orderHint - right.orderHint);
  const expansionsByPhaseKey = new Map(input.expansions.map((expansion) => [expansion.phaseKey, expansion]));
  const crossPhaseLinkPlan = createCrossPhaseLinks(orderedPhases, expansionsByPhaseKey);

  const nodes = orderedPhases.flatMap((phase) => {
    const expansion = expansionsByPhaseKey.get(phase.phaseKey);
    if (!expansion) {
      return [];
    }

    return [
      {
        nodeKey: phase.phaseKey,
        title: phase.title,
        kind: 'phase' as const,
        durationDays: 1,
        dependsOn: [],
      },
      ...expansion.tasks.map((task) => ({
        nodeKey: task.nodeKey,
        title: task.title,
        parentNodeKey: phase.phaseKey,
        kind: 'task' as const,
        durationDays: task.durationDays,
        dependsOn: mergeDependencies(task.nodeKey, task.dependsOnWithinPhase, crossPhaseLinkPlan),
      })),
    ];
  });

  const plan: ExecutableProjectPlan = {
    projectType: input.skeleton.projectType,
    assumptions: input.skeleton.assumptions,
    nodes,
  };

  return {
    plan,
    crossPhaseLinkPlan,
    verdict: evaluateProjectPlanQuality(plan, input.brief),
  };
}
