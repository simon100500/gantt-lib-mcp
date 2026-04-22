import type { Task } from '../types.ts';

export type BaselineCandidateId =
  | 'baselineStartDate_endDate'
  | 'baselineStart_end'
  | 'baselineDates_nested'
  | 'baselineTask_nested';

export interface ProbeTask extends Task {
  baselineStartDate?: string;
  baselineEndDate?: string;
  baselineStart?: string;
  baselineEnd?: string;
  baselineDates?: {
    startDate?: string;
    endDate?: string;
  };
  baselineTask?: {
    startDate?: string;
    endDate?: string;
  };
}

export interface DomTaskbarSnapshot {
  className: string;
  left: string;
  width: string;
  height: string;
  backgroundColor: string;
  text: string;
}

export interface RuntimeProbeSignature {
  taskbarCount: number;
  milestoneCount: number;
  progressBarCount: number;
  taskbars: DomTaskbarSnapshot[];
  rowText: string[];
}

export interface CandidateProbeResult {
  candidateId: BaselineCandidateId;
  signature: RuntimeProbeSignature;
  matchesControl: boolean;
}

export const LIVE_FIXTURE_TASKS: Task[] = [
  {
    id: 'task-1',
    name: 'Live task',
    startDate: '2026-04-10',
    endDate: '2026-04-14',
    progress: 40,
    color: '#4f46e5',
  },
  {
    id: 'milestone-1',
    name: 'Live milestone',
    startDate: '2026-04-16',
    endDate: '2026-04-16',
    type: 'milestone',
    color: '#7c3aed',
  },
];

export const NON_MATCHING_BASELINE_FIXTURE_TASKS: Task[] = [
  {
    id: 'task-1',
    name: 'Live task',
    startDate: '2026-04-10',
    endDate: '2026-04-14',
    progress: 40,
    color: '#4f46e5',
  },
  {
    id: 'milestone-1',
    name: 'Live milestone',
    startDate: '2026-04-16',
    endDate: '2026-04-16',
    type: 'milestone',
    color: '#7c3aed',
  },
  {
    id: 'task-without-baseline',
    name: 'No matching baseline payload',
    startDate: '2026-04-20',
    endDate: '2026-04-22',
    color: '#0f766e',
  },
];

export const BASELINE_CANDIDATES: ReadonlyArray<{
  id: BaselineCandidateId;
  description: string;
}> = [
  {
    id: 'baselineStartDate_endDate',
    description: 'Flat baselineStartDate/baselineEndDate fields, mirroring the only baseline-named runtime token found in the installed bundle.',
  },
  {
    id: 'baselineStart_end',
    description: 'Flat baselineStart/baselineEnd shorthand fields often used in schedule overlays.',
  },
  {
    id: 'baselineDates_nested',
    description: 'Nested baselineDates.startDate/endDate object to test whether the runtime expects grouped baseline metadata.',
  },
  {
    id: 'baselineTask_nested',
    description: 'Nested baselineTask.startDate/endDate object to test whether the runtime expects a copied task-like payload.',
  },
] as const;

function cloneTask<T>(task: T): T {
  return JSON.parse(JSON.stringify(task)) as T;
}

function baselinePayloadFor(candidateId: BaselineCandidateId, startDate: string, endDate: string): Partial<ProbeTask> {
  switch (candidateId) {
    case 'baselineStartDate_endDate':
      return { baselineStartDate: startDate, baselineEndDate: endDate };
    case 'baselineStart_end':
      return { baselineStart: startDate, baselineEnd: endDate };
    case 'baselineDates_nested':
      return { baselineDates: { startDate, endDate } };
    case 'baselineTask_nested':
      return { baselineTask: { startDate, endDate } };
    default: {
      const exhaustive: never = candidateId;
      return exhaustive;
    }
  }
}

export function applyBaselineCandidate(tasks: Task[], candidateId: BaselineCandidateId, options?: { nonMatchingTaskId?: string }): ProbeTask[] {
  return tasks.map((task, index) => {
    const clonedTask = cloneTask(task) as ProbeTask;
    if (options?.nonMatchingTaskId && task.id === options.nonMatchingTaskId) {
      return clonedTask;
    }

    const baselineStart = index === 0 ? '2026-04-04' : '2026-04-12';
    const baselineEnd = index === 0 ? '2026-04-08' : '2026-04-12';

    return {
      ...clonedTask,
      ...baselinePayloadFor(candidateId, baselineStart, baselineEnd),
    };
  });
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function readStyleProperty(node: Element, property: 'left' | 'width' | 'height' | 'backgroundColor'): string {
  const element = node as HTMLElement;
  if (property === 'backgroundColor') {
    return element.style.backgroundColor ?? '';
  }

  return element.style[property] ?? '';
}

export function captureRuntimeProbeSignature(container: HTMLElement): RuntimeProbeSignature {
  const taskbarNodes = Array.from(container.querySelectorAll<HTMLElement>('[data-taskbar="true"], [data-taskbar]'));
  const rowNodes = Array.from(container.querySelectorAll<HTMLElement>('.gantt-tr-row'));

  return {
    taskbarCount: taskbarNodes.length,
    milestoneCount: taskbarNodes.filter((node) => node.className.includes('gantt-tr-milestone')).length,
    progressBarCount: container.querySelectorAll('.gantt-tr-progressBar').length,
    taskbars: taskbarNodes.map((node) => ({
      className: node.className,
      left: readStyleProperty(node, 'left'),
      width: readStyleProperty(node, 'width'),
      height: readStyleProperty(node, 'height'),
      backgroundColor: readStyleProperty(node, 'backgroundColor'),
      text: normalizeText(node.textContent),
    })),
    rowText: rowNodes.map((row) => normalizeText(row.textContent)),
  };
}

export function compareSignatures(control: RuntimeProbeSignature, candidate: RuntimeProbeSignature): boolean {
  return JSON.stringify(control) === JSON.stringify(candidate);
}

export function characterizeAgainstControl(control: RuntimeProbeSignature, candidates: Array<{ candidateId: BaselineCandidateId; signature: RuntimeProbeSignature }>): CandidateProbeResult[] {
  return candidates.map(({ candidateId, signature }) => ({
    candidateId,
    signature,
    matchesControl: compareSignatures(control, signature),
  }));
}

export const GANTT_BASELINE_RUNTIME_CONTRACT_SUMMARY = {
  status: 'unsupported-locally',
  provenFieldSet: null,
  rationale:
    'The installed gantt-lib@0.73.1 runtime exposes deterministic task-bar DOM hooks, but the published type surface has no baseline task fields and the supported candidate payloads in this probe produce the exact same DOM signature as live tasks alone. Downstream overlay wiring must treat baseline overlay support as unproven until the dependency exposes an explicit contract or a newer runtime proves one of these fields.',
  howToRecheck:
    'Run `npm exec vitest run packages/web/src/lib/__tests__/ganttBaselineRuntimeContract.test.tsx` and inspect the candidate matrix in this file.',
} as const;
