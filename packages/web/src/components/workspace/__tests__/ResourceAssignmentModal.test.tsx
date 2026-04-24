// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResourceAssignmentModal } from '../ResourceAssignmentModal.tsx';
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
  name: 'Active Crew',
  type: 'human',
  isActive: true,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  deactivatedAt: null,
};

const inactiveResource: ProjectResource = {
  id: 'resource-inactive',
  userId: 'user-1',
  projectId: 'project-1',
  scope: 'project',
  name: 'Dormant Crew',
  type: 'human',
  isActive: false,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-02T00:00:00.000Z',
  deactivatedAt: '2026-04-02T00:00:00.000Z',
};

const secondActiveResource: ProjectResource = {
  ...activeResource,
  id: 'resource-second-active',
  name: 'Second Active Crew',
};

const assignments: TaskAssignmentRecord[] = [
  {
    id: 'assignment-active',
    projectId: 'project-1',
    taskId: task.id,
    resourceId: activeResource.id,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'assignment-inactive',
    projectId: 'project-1',
    taskId: task.id,
    resourceId: inactiveResource.id,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
];

function renderModal(
  overrides: Partial<React.ComponentProps<typeof ResourceAssignmentModal>> = {},
): { container: HTMLDivElement; root: Root; onSelectionChange: ReturnType<typeof vi.fn>; onSubmit: ReturnType<typeof vi.fn> } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const groups = getTaskAssignmentResourceGroups(task.id, [activeResource, inactiveResource], assignments);
  const onSelectionChange = vi.fn();
  const onSubmit = vi.fn();

  act(() => {
    root.render(
      <ResourceAssignmentModal
        activeAssignedResources={groups.activeAssignedResources}
        assignableResources={[activeResource, secondActiveResource]}
        error={null}
        inactiveAssignedResources={groups.inactiveAssignedResources}
        onCancel={() => {}}
        onSelectionChange={onSelectionChange}
        onSubmit={onSubmit}
        pending={false}
        selectedResourceIds={[activeResource.id]}
        task={task}
        {...overrides}
      />,
    );
  });

  return { container, root, onSelectionChange, onSubmit };
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

describe('ResourceAssignmentModal', () => {
  it('renders active resources as selectable choices and active assignments as context', () => {
    const { container, root } = renderModal();

    expect(container.querySelector('[data-testid="resource-assignment-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="assignment-modal-task-name"]')?.textContent).toContain(task.name);
    expect(container.querySelector('[data-testid="assigned-active-resource-resource-active"]')?.textContent).toContain('Active Crew');

    const activeCheckbox = container.querySelector('[data-testid="assignment-resource-checkbox-resource-active"]') as HTMLInputElement | null;
    const secondCheckbox = container.querySelector('[data-testid="assignment-resource-checkbox-resource-second-active"]') as HTMLInputElement | null;

    expect(activeCheckbox?.checked).toBe(true);
    expect(secondCheckbox?.checked).toBe(false);

    unmount(root);
  });

  it('keeps inactive assigned resources visible as historical context but not selectable', () => {
    const { container, root } = renderModal();

    expect(container.querySelector('[data-testid="assigned-inactive-resource-resource-inactive"]')?.textContent).toContain('Dormant Crew');
    expect(container.querySelector('[data-testid="assignment-resource-checkbox-resource-inactive"]')).toBeNull();

    unmount(root);
  });

  it('disables submit when there are no active assignable resources', () => {
    const { container, root } = renderModal({ assignableResources: [], selectedResourceIds: [] });

    expect(container.querySelector('[data-testid="assignment-modal-no-assignable-resources"]')?.textContent).toContain('Нет активных ресурсов');
    expect((container.querySelector('[data-testid="assignment-modal-submit"]') as HTMLButtonElement | null)?.disabled).toBe(true);

    unmount(root);
  });

  it('renders error text as an accessible alert without hiding task/resource context', () => {
    const { container, root } = renderModal({ error: 'task_has_no_leaf_descendants: Task has no leaves' });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.getAttribute('data-testid')).toBe('assignment-modal-error');
    expect(alert?.textContent).toContain('task_has_no_leaf_descendants');
    expect(container.querySelector('[data-testid="assignment-modal-task-name"]')?.textContent).toContain(task.name);
    expect(container.querySelector('[data-testid="assigned-inactive-resource-resource-inactive"]')?.textContent).toContain('Dormant Crew');

    unmount(root);
  });

  it('submits the full selected resource id array without fetching', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { container, root, onSelectionChange, onSubmit } = renderModal({
      selectedResourceIds: [activeResource.id, secondActiveResource.id],
    });

    const secondCheckbox = container.querySelector('[data-testid="assignment-resource-checkbox-resource-second-active"]') as HTMLInputElement;
    act(() => {
      secondCheckbox.click();
    });
    expect(onSelectionChange).toHaveBeenCalledWith([activeResource.id]);

    const submitButton = container.querySelector('[data-testid="assignment-modal-submit"]') as HTMLButtonElement;
    act(() => {
      submitButton.click();
    });

    expect(onSubmit).toHaveBeenCalledWith([activeResource.id, secondActiveResource.id]);
    expect(fetchSpy).not.toHaveBeenCalled();

    unmount(root);
  });

  it('handles empty or malformed presentation inputs with deterministic empty state', () => {
    const { container, root } = renderModal({
      activeAssignedResources: [],
      assignableResources: [],
      inactiveAssignedResources: [],
      selectedResourceIds: undefined as unknown as string[],
      task: null,
    });

    expect(container.querySelector('[data-testid="assignment-modal-empty-task"]')?.textContent).toContain('Выберите задачу');
    expect(container.querySelector('[data-testid="assignment-modal-no-active-assigned"]')?.textContent).toContain('Активные ресурсы пока не назначены');
    expect(container.querySelector('[data-testid="assignment-modal-no-inactive-assigned"]')?.textContent).toContain('Неактивных исторических назначений нет');
    expect((container.querySelector('[data-testid="assignment-modal-submit"]') as HTMLButtonElement | null)?.disabled).toBe(true);

    unmount(root);
  });
});
