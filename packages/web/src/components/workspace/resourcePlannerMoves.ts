import type { ResourceTimelineMove } from 'gantt-lib';

import type { FrontendProjectCommand } from '../../types.ts';
import { getPlannerItemMetadata, type ResourcePlannerTimelineItem } from './resourcePlannerAdapter.ts';

export type ResourcePlannerMoveRejectionReason =
  | 'locked'
  | 'missing-metadata'
  | 'missing-task-id';

export type ResourcePlannerMoveKind =
  | 'date-only'
  | 'resource-only'
  | 'combined'
  | 'no-op';

interface ResourcePlannerMoveBase {
  itemId: string;
  taskId: string;
  assignmentId: string;
  fromResourceId: string;
  toResourceId: string;
  startDate: string;
  endDate: string;
  commands: FrontendProjectCommand[];
}

export type ResourcePlannerMoveClassification =
  | ({ kind: ResourcePlannerMoveKind } & ResourcePlannerMoveBase)
  | { kind: 'rejected'; reason: ResourcePlannerMoveRejectionReason };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function normalizePlannerMoveDate(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.split('T')[0];
}

function utcDayIndex(value: string): number {
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function durationDays(startDate: string, endDate: string): number {
  return utcDayIndex(endDate) - utcDayIndex(startDate) + 1;
}

function buildDateCommands(
  taskId: string,
  originalStartDate: string,
  originalEndDate: string,
  nextStartDate: string,
  nextEndDate: string,
): FrontendProjectCommand[] {
  const startChanged = originalStartDate !== nextStartDate;
  const endChanged = originalEndDate !== nextEndDate;

  if (!startChanged && !endChanged) {
    return [];
  }

  if (
    startChanged
    && endChanged
    && durationDays(originalStartDate, originalEndDate) === durationDays(nextStartDate, nextEndDate)
  ) {
    return [{ type: 'move_task', taskId, startDate: nextStartDate }];
  }

  if (startChanged && !endChanged) {
    return [{ type: 'resize_task', taskId, anchor: 'start', date: nextStartDate }];
  }

  if (!startChanged && endChanged) {
    return [{ type: 'resize_task', taskId, anchor: 'end', date: nextEndDate }];
  }

  const commands: FrontendProjectCommand[] = [];
  if (utcDayIndex(nextStartDate) < utcDayIndex(originalStartDate)) {
    commands.push({ type: 'resize_task', taskId, anchor: 'end', date: nextEndDate });
    commands.push({ type: 'resize_task', taskId, anchor: 'start', date: nextStartDate });
  } else {
    commands.push({ type: 'resize_task', taskId, anchor: 'start', date: nextStartDate });
    commands.push({ type: 'resize_task', taskId, anchor: 'end', date: nextEndDate });
  }

  return commands;
}

export function classifyResourcePlannerMove(
  move: ResourceTimelineMove<ResourcePlannerTimelineItem>,
): ResourcePlannerMoveClassification {
  if (move.item.locked) {
    return { kind: 'rejected', reason: 'locked' };
  }

  const metadata = getPlannerItemMetadata(move.item);
  if (!metadata) {
    return { kind: 'rejected', reason: 'missing-metadata' };
  }

  const taskId = metadata.taskId;
  if (!taskId) {
    return { kind: 'rejected', reason: 'missing-task-id' };
  }

  const startDate = normalizePlannerMoveDate(move.startDate);
  const endDate = normalizePlannerMoveDate(move.endDate);
  const originalStartDate = normalizePlannerMoveDate(move.item.startDate);
  const originalEndDate = normalizePlannerMoveDate(move.item.endDate);
  const fromResourceId = move.fromResourceId || metadata.resourceId;
  const toResourceId = move.toResourceId || fromResourceId;
  const commands = buildDateCommands(taskId, originalStartDate, originalEndDate, startDate, endDate);
  const dateChanged = commands.length > 0;
  const resourceChanged = fromResourceId !== toResourceId;
  const kind: ResourcePlannerMoveKind = dateChanged && resourceChanged
    ? 'combined'
    : dateChanged
      ? 'date-only'
      : resourceChanged
        ? 'resource-only'
        : 'no-op';

  return {
    kind,
    itemId: move.itemId || metadata.assignmentId,
    taskId,
    assignmentId: metadata.assignmentId,
    fromResourceId,
    toResourceId,
    startDate,
    endDate,
    commands,
  };
}

export function buildReplacementResourceIds(
  currentResourceIds: string[],
  fromResourceId: string,
  toResourceId: string,
): string[] {
  const nextResourceIds = currentResourceIds.map((resourceId) => (
    resourceId === fromResourceId ? toResourceId : resourceId
  ));

  if (!nextResourceIds.includes(toResourceId)) {
    nextResourceIds.push(toResourceId);
  }

  return nextResourceIds.filter((resourceId, index) => (
    resourceId.trim().length > 0 && nextResourceIds.indexOf(resourceId) === index
  ));
}
