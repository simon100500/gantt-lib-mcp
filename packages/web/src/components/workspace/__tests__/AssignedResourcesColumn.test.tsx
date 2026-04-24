// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssignedResourcesColumnCell, createAssignedResourcesColumn } from '../AssignedResourcesColumn.tsx';
import type { ProjectResource, TaskAssignmentRecord } from '../../../lib/apiTypes.ts';
import type { Task } from '../../../types.ts';
import { getTaskAssignmentResourceGroups } from '../resourceAssignmentUtils.ts';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const task: Task = {
  id: 'task-1',
  name: 'Монтаж каркаса',
  startDate: '2026-04-01',
  endDate: '2026-04-03',
  dependencies: [],
};

const activeResource: ProjectResource = {
  id: 'resource-active',
  userId: 'user-1',
  projectId: 'project-1',
  scope: 'project',
  name: 'Бригада монтажников',
  type: 'human',
  isActive: true,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  deactivatedAt: null,
};

const secondActiveResource: ProjectResource = {
  ...activeResource,
  id: 'resource-second-active',
  name: 'Крановщик',
};

const inactiveResource: ProjectResource = {
  ...activeResource,
  id: 'resource-inactive',
  name: 'Архивная бригада',
  isActive: false,
  updatedAt: '2026-04-02T00:00:00.000Z',
  deactivatedAt: '2026-04-02T00:00:00.000Z',
};

function assignment(overrides: Partial<TaskAssignmentRecord>): TaskAssignmentRecord {
  return {
    id: `assignment-${overrides.resourceId ?? 'resource'}`,
    projectId: 'project-1',
    taskId: task.id,
    resourceId: activeResource.id,
    createdAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderCell(
  overrides: Partial<React.ComponentProps<typeof AssignedResourcesColumnCell>> = {},
  resources: ProjectResource[] = [activeResource, inactiveResource, secondActiveResource],
  assignments: TaskAssignmentRecord[] = [assignment({ id: 'assignment-active', resourceId: activeResource.id })],
): { container: HTMLDivElement; root: Root; onEdit: ReturnType<typeof vi.fn> } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onEdit = vi.fn();

  act(() => {
    root.render(
      <AssignedResourcesColumnCell
        editable
        groups={getTaskAssignmentResourceGroups(task.id, resources, assignments)}
        onEdit={onEdit}
        readOnly={false}
        task={task}
        {...overrides}
      />,
    );
  });

  return { container, root, onEdit };
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

describe('AssignedResourcesColumnCell', () => {
  it('renders a deterministic empty state and edit hook for unassigned tasks', () => {
    const { container, root, onEdit } = renderCell({}, [activeResource], []);

    expect(container.querySelector('[data-testid="assigned-resources-cell-task-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="assigned-resources-cell-task-1"]')?.getAttribute('data-assigned-resource-count')).toBe('0');
    expect(container.querySelector('[data-testid="assigned-resources-empty-task-1"]')?.textContent).toContain('Ресурсы не назначены');

    act(() => {
      (container.querySelector('[data-testid="assigned-resources-edit-task-1"]') as HTMLButtonElement).click();
    });
    expect(onEdit).toHaveBeenCalledWith(task);

    unmount(root);
  });

  it('renders active assigned resources as named chips and deduplicates duplicate active assignments', () => {
    const { container, root } = renderCell({}, [activeResource, secondActiveResource], [
      assignment({ id: 'assignment-active-1', resourceId: activeResource.id }),
      assignment({ id: 'assignment-active-duplicate', resourceId: activeResource.id }),
      assignment({ id: 'assignment-active-2', resourceId: secondActiveResource.id }),
    ]);

    expect(container.querySelector('[data-testid="assigned-resources-cell-task-1"]')?.getAttribute('data-assigned-resource-count')).toBe('2');
    expect(container.querySelector('[data-testid="assigned-resources-active-task-1-resource-active"]')?.textContent).toContain('Бригада монтажников');
    expect(container.querySelector('[data-testid="assigned-resources-active-task-1-resource-second-active"]')?.textContent).toContain('Крановщик');
    expect(container.querySelectorAll('[data-testid="assigned-resources-active-task-1-resource-active"]')).toHaveLength(1);

    unmount(root);
  });

  it('keeps inactive assigned resources visible as historical chips', () => {
    const { container, root } = renderCell({}, [inactiveResource], [
      assignment({ id: 'assignment-inactive', resourceId: inactiveResource.id }),
    ]);

    const inactiveChip = container.querySelector('[data-testid="assigned-resources-inactive-task-1-resource-inactive"]');
    expect(inactiveChip?.textContent).toContain('Архивная бригада');
    expect(inactiveChip?.textContent).toContain('неактивен');
    expect(inactiveChip?.getAttribute('title')).toContain('неактивный ресурс');

    unmount(root);
  });

  it('renders unknown resource assignments as safe fallback indicators instead of throwing', () => {
    const { container, root } = renderCell({}, [activeResource], [
      assignment({ id: 'assignment-known', resourceId: activeResource.id }),
      assignment({ id: 'assignment-unknown', resourceId: 'resource-missing' }),
    ]);

    const fallback = container.querySelector('[data-testid="assigned-resources-unknown-task-1-resource-missing"]');
    expect(container.querySelector('[data-testid="assigned-resources-cell-task-1"]')?.getAttribute('data-assigned-resource-count')).toBe('2');
    expect(fallback?.textContent).toContain('Неизвестный ресурс');
    expect(fallback?.textContent).toContain('resource-missing');

    unmount(root);
  });

  it('omits the correction button in read-only mode while preserving visible assignments', () => {
    const { container, root, onEdit } = renderCell({ readOnly: true });

    expect(container.querySelector('[data-testid="assigned-resources-active-task-1-resource-active"]')?.textContent).toContain('Бригада монтажников');
    expect(container.querySelector('[data-testid="assigned-resources-edit-task-1"]')).toBeNull();
    expect(onEdit).not.toHaveBeenCalled();

    unmount(root);
  });
});

describe('createAssignedResourcesColumn', () => {
  it('returns a gantt-lib additional column that renders task-scoped cells through the existing edit callback', () => {
    const onEdit = vi.fn();
    const column = createAssignedResourcesColumn({
      resources: [activeResource],
      assignments: [assignment({ id: 'assignment-active', resourceId: activeResource.id })],
      onEdit,
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    expect(column.id).toBe('assigned-resources');
    expect(column.header).toBe('Ресурсы');
    expect('after' in column ? column.after : undefined).toBe('name');

    act(() => {
      root.render(<>{column.renderCell({
        task,
        rowIndex: 0,
        isEditing: false,
        openEditor: vi.fn(),
        closeEditor: vi.fn(),
        updateTask: vi.fn(),
      })}</>);
    });

    expect(container.querySelector('[data-testid="assigned-resources-cell-task-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="assigned-resources-active-task-1-resource-active"]')?.textContent).toContain('Бригада монтажников');

    act(() => {
      (container.querySelector('[data-testid="assigned-resources-edit-task-1"]') as HTMLButtonElement).click();
    });
    expect(onEdit).toHaveBeenCalledWith(task);

    unmount(root);
  });
});
