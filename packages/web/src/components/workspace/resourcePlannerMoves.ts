import type { ResourceTimelineMove } from 'gantt-lib';

import { buildScheduleDateCommands, normalizeDateOnly } from '../../lib/scheduleMutationUtils.ts';
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

export const normalizePlannerMoveDate = normalizeDateOnly;

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
  const commands = buildScheduleDateCommands({
    taskId,
    originalStartDate,
    originalEndDate,
    nextStartDate: startDate,
    nextEndDate: endDate,
  });
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
