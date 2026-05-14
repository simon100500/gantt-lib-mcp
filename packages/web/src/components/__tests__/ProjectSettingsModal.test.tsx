// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectSettingsModal } from '../ProjectSettingsModal.tsx';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderModal(onSave: (settings: {
  projectName: string;
  ganttDayMode: 'business' | 'calendar';
  calendarWeeklyPattern: { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean };
  calendarDays: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }>;
  timelineMarkers: Array<{ date: string; color?: string | null; name?: string | null }>;
  hiddenTaskListColumnsDefault: string[] | null;
}) => void | Promise<void>, hiddenTaskListColumnsDefault: string[] | null, overrides: Partial<React.ComponentProps<typeof ProjectSettingsModal>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      <ProjectSettingsModal
        projectName="Проект"
        ganttDayMode="calendar"
        calendarWeeklyPattern={{ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }}
        calendarDays={[]}
        timelineMarkers={[]}
        hiddenTaskListColumnsDefault={hiddenTaskListColumnsDefault}
        taskListColumnRows={[
          { id: 'name', label: 'Имя' },
          { id: 'status', label: 'Статус' },
        ]}
        pending={false}
        error={null}
        canEditProjectName
        canShiftProject={false}
        canEditGanttDayMode
        canEditTimelineMarkers
        canEditTaskListColumnsDefault
        onClose={() => {}}
        onOpenProjectShift={() => {}}
        onSave={onSave}
        {...overrides}
      />,
    );
  });
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
  container?.remove();
  container = null;
  root = null;
});

describe('ProjectSettingsModal', () => {
  it('preserves null project default when saved without changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderModal(onSave, null);

    const form = container!.querySelector('form');
    expect(form).toBeTruthy();

    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      hiddenTaskListColumnsDefault: null,
    }));
  });

  it('does not render an empty marker placeholder', () => {
    renderModal(vi.fn(), null);

    expect(container!.textContent).not.toContain('Маркеры не добавлены.');
  });

  it('asks for confirmation before clearing all tasks', async () => {
    const onClearTasks = vi.fn().mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderModal(vi.fn(), null, {
      canClearTasks: true,
      onClearTasks,
    });

    const clearButton = Array.from(container!.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Очистить все задачи'));

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalledWith('Очистить все задачи проекта? Действие можно будет отменить через историю.');
    expect(onClearTasks).toHaveBeenCalledTimes(1);
  });
});
