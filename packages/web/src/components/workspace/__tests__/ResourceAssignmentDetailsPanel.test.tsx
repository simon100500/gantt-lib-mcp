// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResourceAssignmentDetailsPanel, type AssignmentResourceView } from '../ResourceAssignmentDetailsPanel.tsx';
import type { ProjectResource } from '../../../lib/apiTypes.ts';
import type { ResourcePlannerTimelineItem } from '../resourcePlannerAdapter.ts';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const resource: ProjectResource = {
  id: 'resource-1',
  userId: 'user-1',
  projectId: 'project-1',
  scope: 'project',
  name: 'Бригада монтажа',
  type: 'human',
  isActive: true,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  deactivatedAt: null,
};

const item: ResourcePlannerTimelineItem = {
  id: 'assignment-1',
  resourceId: 'resource-1',
  taskId: 'task-1',
  title: 'Монтаж каркаса',
  subtitle: 'Project 1',
  startDate: '2026-04-01',
  endDate: '2026-04-03',
  metadata: {
    source: 'resource-planner-result',
    projectId: 'project-1',
    projectName: 'Project 1',
    taskId: 'task-1',
    assignmentId: 'assignment-1',
    resourceId: 'resource-1',
    resourceName: 'Бригада монтажа',
    hasConflict: false,
    conflictCount: 0,
    conflictAssignmentIds: [],
    assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
  },
};

const assignedResources: AssignmentResourceView[] = [
  {
    assignmentId: 'assignment-1',
    resource,
  },
];

async function renderPanel(props: Partial<React.ComponentProps<typeof ResourceAssignmentDetailsPanel>> = {}): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ResourceAssignmentDetailsPanel
        item={item}
        resource={resource}
        resources={[resource]}
        assignedResources={assignedResources}
        readonly={false}
        onClose={vi.fn()}
        {...props}
      />,
    );
    await Promise.resolve();
  });

  return { container, root };
}

async function unmount(root: Root): Promise<void> {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ResourceAssignmentDetailsPanel', () => {
  it('renders a task navigation button near the assignment dates', async () => {
    const { container, root } = await renderPanel({ onOpenTask: vi.fn() });

    expect(container.querySelector('[data-testid="assignment-details-open-task"]')?.textContent).toContain('Перейти');

    await unmount(root);
  });

  it('emits the current task target when the task navigation button is clicked', async () => {
    const onOpenTask = vi.fn();
    const { container, root } = await renderPanel({ onOpenTask });

    await act(async () => {
      (container.querySelector('[data-testid="assignment-details-open-task"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(onOpenTask).toHaveBeenCalledWith({
      projectId: 'project-1',
      taskId: 'task-1',
      assignmentId: 'assignment-1',
      resourceId: 'resource-1',
    });

    await unmount(root);
  });
});
