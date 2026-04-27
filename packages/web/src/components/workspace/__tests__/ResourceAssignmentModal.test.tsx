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
): {
  container: HTMLDivElement;
  root: Root;
  onCancel: ReturnType<typeof vi.fn>;
  onSelectionChange: ReturnType<typeof vi.fn>;
  onSubmit: ReturnType<typeof vi.fn>;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const groups = getTaskAssignmentResourceGroups(task.id, [activeResource, inactiveResource], assignments);
  const onCancel = vi.fn();
  const onSelectionChange = vi.fn();
  const onSubmit = vi.fn();

  act(() => {
    root.render(
      <ResourceAssignmentModal
        activeAssignedResources={groups.activeAssignedResources}
        assignableResources={[activeResource, secondActiveResource]}
        error={null}
        inactiveAssignedResources={groups.inactiveAssignedResources}
        onCancel={onCancel}
        onSelectionChange={onSelectionChange}
        onSubmit={onSubmit}
        pending={false}
        selectedResourceIds={[activeResource.id]}
        task={task}
        {...overrides}
      />,
    );
  });

  return { container, root, onCancel, onSelectionChange, onSubmit };
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

  it('exposes dialog labelling and connects visible errors to assistive technology', () => {
    const { container, root } = renderModal({ error: 'network_failure: Не удалось сохранить назначения ресурсов.' });

    const dialog = container.querySelector('[data-testid="resource-assignment-modal"]');
    const title = container.querySelector('#resource-assignment-modal-title');
    const error = container.querySelector('[data-testid="assignment-modal-error"]');

    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('resource-assignment-modal-title');
    expect(dialog?.getAttribute('aria-describedby')).toBe('resource-assignment-modal-error');
    expect(title?.textContent).toContain(task.name);
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.getAttribute('aria-atomic')).toBe('true');
    expect(error?.textContent).toContain('network_failure');

    unmount(root);
  });

  it('disables modal controls and exposes busy submit text while pending', () => {
    const onCancel = vi.fn();
    const { container, root, onSelectionChange, onSubmit } = renderModal({ onCancel, pending: true });

    const secondOption = container.querySelector('[data-testid="assignment-resource-option-resource-second-active"]') as HTMLButtonElement | null;
    const removeButton = container.querySelector('[data-testid="assignment-selected-resource-remove-resource-active"]') as HTMLButtonElement | null;
    const submitButton = container.querySelector('[data-testid="assignment-modal-submit"]') as HTMLButtonElement | null;
    const cancelButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Отмена')) as HTMLButtonElement | undefined;

    expect(secondOption?.disabled).toBe(true);
    expect(removeButton?.disabled).toBe(true);
    expect(submitButton?.disabled).toBe(true);
    expect(submitButton?.getAttribute('aria-busy')).toBe('true');
    expect(submitButton?.textContent).toContain('Сохраняем назначение');
    expect(cancelButton?.disabled).toBe(true);
    expect(cancelButton?.getAttribute('aria-label')).toBe('Закрыть окно назначения ресурсов');

    act(() => {
      secondOption?.click();
      removeButton?.click();
      submitButton?.click();
      cancelButton?.click();
    });

    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    unmount(root);
  });

  it('adds a newly checked resource id to the selected array deterministically', () => {
    const { container, root, onSelectionChange } = renderModal({ selectedResourceIds: [activeResource.id] });

    const secondOption = container.querySelector('[data-testid="assignment-resource-option-resource-second-active"]') as HTMLButtonElement;
    act(() => {
      secondOption.click();
    });

    expect(onSelectionChange).toHaveBeenCalledWith([activeResource.id, secondActiveResource.id]);

    unmount(root);
  });

  it('removes selected resources through current assignment chips', () => {
    const { container, root, onSelectionChange } = renderModal({
      selectedResourceIds: [activeResource.id, secondActiveResource.id],
    });

    expect(container.querySelector('[data-testid="assigned-selected-resource-resource-active"]')?.textContent).toContain('Active Crew');
    expect(container.querySelector('[data-testid="assigned-selected-resource-resource-second-active"]')?.textContent).toContain('Second Active Crew');

    const removeButton = container.querySelector('[data-testid="assignment-selected-resource-remove-resource-active"]') as HTMLButtonElement;
    act(() => {
      removeButton.click();
    });

    expect(onSelectionChange).toHaveBeenCalledWith([secondActiveResource.id]);

    unmount(root);
  });

  it('closes when the backdrop outside the form is clicked', () => {
    const { container, root, onCancel } = renderModal();
    const dialog = container.querySelector('[data-testid="resource-assignment-modal"]') as HTMLDivElement;
    const form = dialog.querySelector('form') as HTMLFormElement;

    act(() => {
      form.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onCancel).not.toHaveBeenCalled();

    act(() => {
      dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);

    unmount(root);
  });

  it('renders selected resources as removable chips and active resources as selectable choices', () => {
    const { container, root } = renderModal();

    expect(container.querySelector('[data-testid="resource-assignment-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="assignment-modal-task-name"]')?.textContent).toContain(task.name);
    expect(container.querySelector('[data-testid="assigned-selected-resource-resource-active"]')?.textContent).toContain('Active Crew');
    expect(container.querySelector('[data-testid="assignment-selected-resource-remove-resource-active"]')).not.toBeNull();

    const activeOption = container.querySelector('[data-testid="assignment-resource-option-resource-active"]') as HTMLButtonElement | null;
    const secondOption = container.querySelector('[data-testid="assignment-resource-option-resource-second-active"]') as HTMLButtonElement | null;

    expect(activeOption).toBeNull();
    expect(secondOption).not.toBeNull();
    expect(container.querySelector('[data-testid^="assignment-resource-checkbox-"]')).toBeNull();

    unmount(root);
  });

  it('omits inactive historical assignments and keeps inactive resources non-selectable', () => {
    const { container, root } = renderModal();

    expect(container.textContent).not.toContain('Исторические неактивные назначения');
    expect(container.textContent).not.toContain('Неактивных исторических назначений нет');
    expect(container.textContent).not.toContain('Dormant Crew');
    expect(container.querySelector('[data-testid="assigned-inactive-resource-resource-inactive"]')).toBeNull();
    expect(container.querySelector('[data-testid="assignment-resource-option-resource-inactive"]')).toBeNull();

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
    expect(container.querySelector('[data-testid="assigned-selected-resource-resource-active"]')?.textContent).toContain('Active Crew');
    expect(container.querySelector('[data-testid="assignment-modal-resource-options"]')?.textContent).toContain('Second Active Crew');

    unmount(root);
  });

  it('submits the full selected resource id array without fetching', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { container, root, onSubmit } = renderModal({
      selectedResourceIds: [activeResource.id, secondActiveResource.id],
    });

    expect(container.querySelector('[data-testid="assignment-resource-option-resource-active"]')).toBeNull();
    expect(container.querySelector('[data-testid="assignment-resource-option-resource-second-active"]')).toBeNull();
    expect(container.querySelector('[data-testid="assignment-modal-all-resources-selected"]')?.textContent).toContain('Все доступные ресурсы назначены');

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
    expect(container.querySelector('[data-testid="assignment-modal-no-selected-resources"]')?.textContent).toContain('Пока пусто');
    expect(container.querySelector('[data-testid="assignment-modal-no-inactive-assigned"]')).toBeNull();
    expect((container.querySelector('[data-testid="assignment-modal-submit"]') as HTMLButtonElement | null)?.disabled).toBe(true);

    unmount(root);
  });
});
