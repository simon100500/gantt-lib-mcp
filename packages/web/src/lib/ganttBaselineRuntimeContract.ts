import type { Task } from '../types.ts';

export type BaselineCandidateId = 'baselineStartDate_endDate';

export interface ProbeTask extends Task {
  baselineStartDate?: string;
  baselineEndDate?: string;
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
  baselineCount: number;
  baselineBars: DomTaskbarSnapshot[];
  taskbars: DomTaskbarSnapshot[];
  rowText: string[];
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

function cloneTask<T>(task: T): T {
  return JSON.parse(JSON.stringify(task)) as T;
}

export function applyBaselineCandidate(tasks: Task[], candidateId: BaselineCandidateId, options?: { nonMatchingTaskId?: string }): ProbeTask[] {
  if (candidateId !== 'baselineStartDate_endDate') {
    throw new Error(`Unsupported candidate: ${candidateId}`);
  }

  return tasks.map((task, index) => {
    const clonedTask = cloneTask(task) as ProbeTask;
    if (options?.nonMatchingTaskId && task.id === options.nonMatchingTaskId) {
      return clonedTask;
    }

    const baselineStartDate = index === 0 ? '2026-04-04' : '2026-04-12';
    const baselineEndDate = index === 0 ? '2026-04-08' : '2026-04-12';

    return {
      ...clonedTask,
      baselineStartDate,
      baselineEndDate,
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

function captureNodeSnapshot(node: HTMLElement): DomTaskbarSnapshot {
  return {
    className: node.className,
    left: readStyleProperty(node, 'left'),
    width: readStyleProperty(node, 'width'),
    height: readStyleProperty(node, 'height'),
    backgroundColor: readStyleProperty(node, 'backgroundColor'),
    text: normalizeText(node.textContent),
  };
}

export function captureRuntimeProbeSignature(container: HTMLElement): RuntimeProbeSignature {
  const taskbarNodes = Array.from(container.querySelectorAll<HTMLElement>('[data-taskbar="true"], [data-taskbar]'));
  const baselineNodes = Array.from(container.querySelectorAll<HTMLElement>('.gantt-tr-baseline'));
  const rowNodes = Array.from(container.querySelectorAll<HTMLElement>('.gantt-tr-row'));

  return {
    taskbarCount: taskbarNodes.length,
    milestoneCount: taskbarNodes.filter((node) => node.className.includes('gantt-tr-milestone')).length,
    progressBarCount: container.querySelectorAll('.gantt-tr-progressBar').length,
    baselineCount: baselineNodes.length,
    baselineBars: baselineNodes.map(captureNodeSnapshot),
    taskbars: taskbarNodes.map(captureNodeSnapshot),
    rowText: rowNodes.map((row) => normalizeText(row.textContent)),
  };
}

export const GANTT_BASELINE_RUNTIME_CONTRACT_SUMMARY = {
  status: 'supported-locally',
  provenFieldSet: 'baselineStartDate_endDate + showBaseline',
  rationale:
    'The installed gantt-lib runtime supports baseline overlays through Task.baselineStartDate, Task.baselineEndDate, and GanttChart.showBaseline. Enabling showBaseline produces additional .gantt-tr-baseline DOM nodes for matching tasks and milestones.',
  howToRecheck:
    'Run `npm exec vitest run packages/web/src/lib/__tests__/ganttBaselineRuntimeContract.test.tsx` and verify that baselineCount is greater than zero only when showBaseline is enabled.',
} as const;
