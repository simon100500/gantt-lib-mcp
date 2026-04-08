import type { GenerationMode } from './types.js';

export type AgentRouteRequestClass = 'broad_generation' | 'mutation';

export type SelectAgentRouteInput = {
  userMessage: string;
  taskCount: number;
  hasHierarchy: boolean;
  requestClass?: AgentRouteRequestClass;
};

export type AgentRouteSelection = {
  route: GenerationMode;
  reason: 'empty_project_broad_generation_request' | 'default_mutation_flow';
  isEmptyProject: boolean;
  requestClass: AgentRouteRequestClass;
  hasHierarchy: boolean;
  taskCount: number;
};

function classifyRequest(userMessage: string): AgentRouteRequestClass {
  const normalized = userMessage.trim().toLowerCase();
  const generationVerb = /(постро|состав|сформир|созда|generate|build|draft|create)/.test(normalized);
  const scheduleTarget = /(график|план|расписан|schedule|timeline|gantt)/.test(normalized);

  if (generationVerb && scheduleTarget) {
    return 'broad_generation';
  }

  if (normalized === 'построй график' || normalized === 'build schedule') {
    return 'broad_generation';
  }

  return 'mutation';
}

export function selectAgentRoute(input: SelectAgentRouteInput): AgentRouteSelection {
  const requestClass = input.requestClass ?? classifyRequest(input.userMessage);
  const isEmptyProject = input.taskCount === 0;

  if (isEmptyProject && requestClass === 'broad_generation') {
    return {
      route: 'initial_generation',
      reason: 'empty_project_broad_generation_request',
      isEmptyProject,
      requestClass,
      hasHierarchy: input.hasHierarchy,
      taskCount: input.taskCount,
    };
  }

  return {
    route: 'mutation',
    reason: 'default_mutation_flow',
    isEmptyProject,
    requestClass,
    hasHierarchy: input.hasHierarchy,
    taskCount: input.taskCount,
  };
}
