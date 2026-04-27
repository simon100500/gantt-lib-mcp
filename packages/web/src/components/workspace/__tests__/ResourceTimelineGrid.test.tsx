// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResourceTimelineGrid } from '../ResourceTimelineGrid.tsx';
import type { ResourcePlannerResource } from '../../../lib/apiTypes.ts';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type IntervalInput = ResourcePlannerResource['intervals'][number];

function makeInterval(overrides: Partial<IntervalInput> = {}): IntervalInput {
  return {
    assignmentId: 'assignment-1',
    resourceId: 'resource-1',
    resourceName: 'Shared Crew',
    projectId: 'project-1',
    projectName: 'Project One',
    taskId: 'task-1',
    taskName: 'Frame installation',
    startDate: '2026-04-01',
    endDate: '2026-04-03',
    assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
    hasConflict: false,
    conflictCount: 0,
    conflictAssignmentIds: [],
    ...overrides,
  };
}

function makeResource(overrides: Partial<ResourcePlannerResource> = {}): ResourcePlannerResource {
  return {
    resourceId: 'resource-1',
    resourceName: 'Shared Crew',
    hasConflicts: false,
    conflictCount: 0,
    intervals: [makeInterval()],
    ...overrides,
  };
}

function renderGrid(
  overrides: Partial<React.ComponentProps<typeof ResourceTimelineGrid>> = {},
): { container: HTMLDivElement; root: Root; onCorrectConflict: ReturnType<typeof vi.fn> } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onCorrectConflict = vi.fn();

  act(() => {
    root.render(
      <ResourceTimelineGrid
        emptyMessage="No planner resources"
        onCorrectConflict={onCorrectConflict}
        resources={[makeResource()]}
        {...overrides}
      />,
    );
  });

  return { container, root, onCorrectConflict };
}

function unmount(root: Root): void {
  act(() => {
    root.unmount();
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('ResourceTimelineGrid', () => {
  it('renders an empty timeline message supplied by the parent', () => {
    const { container, root } = renderGrid({ resources: [] });

    expect(container.querySelector('[data-testid="resource-timeline-grid"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="resource-timeline-empty-state"]')?.textContent).toBe('No planner resources');

    unmount(root);
  });

  it('derives calendar day headers and renders multiple valid bars on one resource row', () => {
    const resource = makeResource({
      intervals: [
        makeInterval({ assignmentId: 'assignment-1', taskName: 'Frame installation', startDate: '2026-04-01', endDate: '2026-04-03' }),
        makeInterval({ assignmentId: 'assignment-2', taskId: 'task-2', taskName: 'Facade QA', startDate: '2026-04-05', endDate: '2026-04-05' }),
      ],
    });
    const { container, root } = renderGrid({ resources: [resource] });

    expect(container.querySelector('[data-testid="resource-timeline-row-resource-1"]')?.textContent).toContain('Shared Crew');
    expect(container.querySelector('[data-testid="resource-timeline-calendar-day-2026-04-01"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="resource-timeline-calendar-day-2026-04-05"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="resource-timeline-bar-assignment-1"]')?.textContent).toContain('Frame installation');
    expect(container.querySelector('[data-testid="resource-timeline-bar-assignment-2"]')?.textContent).toContain('Facade QA');

    unmount(root);
  });

  it('marks conflicted intervals with peer ids and calls correction actions with the interval target', () => {
    const conflictedInterval = makeInterval({
      assignmentId: 'assignment-conflict',
      projectId: 'project-2',
      taskId: 'task-2',
      hasConflict: true,
      conflictCount: 2,
      conflictAssignmentIds: ['assignment-peer-1', 'assignment-peer-2'],
    });
    const resource = makeResource({
      hasConflicts: true,
      conflictCount: 2,
      intervals: [conflictedInterval],
    });
    const { container, root, onCorrectConflict } = renderGrid({ resources: [resource] });

    expect(container.querySelector('[data-testid="resource-timeline-conflict-badge-resource-1"]')?.textContent).toContain('Конфликтов: 2');
    expect(container.querySelector('[data-testid="resource-timeline-conflict-assignment-conflict"]')?.textContent).toContain('assignment-peer-1, assignment-peer-2');

    act(() => {
      (container.querySelector('[data-testid="resource-timeline-correct-assignment-conflict"]') as HTMLButtonElement).click();
    });

    expect(onCorrectConflict).toHaveBeenCalledWith({
      projectId: 'project-2',
      taskId: 'task-2',
      assignmentId: 'assignment-conflict',
      resourceId: 'resource-1',
    });

    unmount(root);
  });

  it('keeps resource rows visible and surfaces malformed date diagnostics', () => {
    const resource = makeResource({
      intervals: [
        makeInterval({ assignmentId: 'assignment-valid', startDate: '2026-04-01', endDate: '2026-04-01' }),
        makeInterval({ assignmentId: 'assignment-malformed', taskName: 'Broken dates', startDate: 'not-a-date', endDate: '2026-04-02' }),
      ],
    });
    const { container, root } = renderGrid({ resources: [resource] });

    expect(container.querySelector('[data-testid="resource-timeline-row-resource-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="resource-timeline-bar-assignment-valid"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="resource-timeline-invalid-intervals"]')?.textContent).toContain('Некорректные интервалы: 1');
    expect(container.querySelector('[data-testid="resource-timeline-invalid-interval-assignment-malformed"]')?.textContent).toContain('Некорректные даты');
    expect(container.querySelector('[data-testid="resource-timeline-invalid-interval-assignment-malformed"]')?.textContent).toContain('Broken dates');

    unmount(root);
  });

  it('keeps resource rows visible and surfaces end-before-start diagnostics', () => {
    const resource = makeResource({
      intervals: [
        makeInterval({ assignmentId: 'assignment-reversed', taskName: 'Reversed task', startDate: '2026-04-04', endDate: '2026-04-02' }),
      ],
    });
    const { container, root } = renderGrid({ resources: [resource] });

    expect(container.querySelector('[data-testid="resource-timeline-row-resource-1"]')?.textContent).toContain('Shared Crew');
    expect(container.querySelector('[data-testid="resource-timeline-no-valid-intervals"]')?.textContent).toContain('Нет корректных календарных интервалов');
    expect(container.querySelector('[data-testid="resource-timeline-invalid-interval-assignment-reversed"]')?.textContent).toContain('Дата окончания раньше даты начала');

    unmount(root);
  });

  it('renders a zero-valid-interval state without dropping resources', () => {
    const resource = makeResource({ intervals: [] });
    const { container, root } = renderGrid({ resources: [resource] });

    expect(container.querySelector('[data-testid="resource-timeline-row-resource-1"]')?.textContent).toContain('0 корректн. / 0 некорректн.');
    expect(container.querySelector('[data-testid="resource-timeline-no-valid-intervals"]')).not.toBeNull();
    expect(container.querySelector('[data-testid^="resource-timeline-calendar-day-"]')).toBeNull();

    unmount(root);
  });

  it('clamps oversized ranges to deterministic rendered day columns', () => {
    const resource = makeResource({
      intervals: [makeInterval({ assignmentId: 'assignment-long', startDate: '2026-04-01', endDate: '2026-05-20' })],
    });
    const { container, root } = renderGrid({ maxRenderedDays: 7, resources: [resource] });

    expect(container.querySelector('[data-testid="resource-timeline-range-clamped"]')?.textContent).toContain('Показано 7 из 50 дней');
    expect(container.querySelectorAll('[data-testid^="resource-timeline-calendar-day-"]')).toHaveLength(7);
    expect(container.querySelector('[data-testid="resource-timeline-calendar-day-2026-04-07"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="resource-timeline-calendar-day-2026-04-08"]')).toBeNull();
    expect(container.querySelector('[data-testid="resource-timeline-bar-assignment-long"]')?.textContent).toContain('сжато');

    unmount(root);
  });
});
