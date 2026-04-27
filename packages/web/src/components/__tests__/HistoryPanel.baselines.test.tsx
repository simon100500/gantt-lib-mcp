// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/dropdown-menu.tsx', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-root">{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean }) => (
    <button type="button" data-disabled={disabled ? '' : undefined} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

import { HistoryPanel } from '../HistoryPanel.tsx';
import type { HistoryItem } from '../../lib/apiTypes.ts';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseItems: HistoryItem[] = [
  {
    id: 'history-current',
    actorType: 'user',
    title: 'move_task',
    createdAt: '2026-04-22T10:00:00.000Z',
    baseVersion: 1,
    newVersion: 2,
    commandCount: 1,
    isCurrent: true,
    canRestore: false,
  },
  {
    id: 'history-old',
    actorType: 'agent',
    title: 'resize_task',
    createdAt: '2026-04-21T09:00:00.000Z',
    baseVersion: 0,
    newVersion: 1,
    commandCount: 1,
    isCurrent: false,
    canRestore: true,
  },
];

function renderPanel(overrides: Partial<React.ComponentProps<typeof HistoryPanel>> = {}): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  act(() => {
    root.render(
      <HistoryPanel
        items={baseItems}
        loading={false}
        error={null}
        disabled={false}
        previewGroupId={null}
        previewingGroupId={null}
        restoringGroupId={null}
        creatingBaselineFromHistoryGroupId={null}
        onClose={() => {}}
        onRefresh={() => {}}
        onPreviewVersion={() => {}}
        onRestoreVersion={() => {}}
        onCreateBaselineFromHistory={() => {}}
        onReturnToCurrentVersion={() => {}}
        {...overrides}
      />,
    );
  });

  return { container, root };
}

describe('HistoryPanel baseline actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows create-baseline action only for non-current history rows and keeps restore alongside it', async () => {
    const onCreateBaselineFromHistory = vi.fn();
    const onPreviewVersion = vi.fn();
    const { container, root } = renderPanel({ onCreateBaselineFromHistory, onPreviewVersion });

    const actionButtons = Array.from(container.querySelectorAll('button[aria-label="Действия с версией"]')) as HTMLButtonElement[];
    expect(actionButtons).toHaveLength(1);
    expect(container.textContent).toContain('Сохранить как baseline');
    expect(container.textContent).toContain('Восстановить эту версию');
    expect(container.textContent).not.toContain('history-currentСохранить как baseline');

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Сохранить как baseline'));
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onCreateBaselineFromHistory).toHaveBeenCalledTimes(1);
    expect(onCreateBaselineFromHistory).toHaveBeenCalledWith(baseItems[1]);
    expect(onPreviewVersion).not.toHaveBeenCalled();

    root.unmount();
  });

  it('disables only the matching row create action and shows row-scoped in-flight label', async () => {
    const onCreateBaselineFromHistory = vi.fn();
    const { container, root } = renderPanel({
      items: [
        baseItems[0],
        baseItems[1],
        {
          ...baseItems[1],
          id: 'history-old-2',
          createdAt: '2026-04-20T09:00:00.000Z',
          title: 'create_task',
        },
      ],
      creatingBaselineFromHistoryGroupId: 'history-old',
      onCreateBaselineFromHistory,
    });

    expect(container.textContent).toContain('Сохранение baseline');
    expect(container.textContent).toContain('Сохраняем baseline…');

    const loadingCreateButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Сохраняем baseline…'));
    const idleCreateButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Сохранить как baseline'));

    expect(loadingCreateButton?.hasAttribute('data-disabled')).toBe(true);
    expect(idleCreateButton?.hasAttribute('data-disabled')).toBe(false);

    await act(async () => {
      loadingCreateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onCreateBaselineFromHistory).not.toHaveBeenCalled();

    root.unmount();
  });

  it('respects global disabled state for create action without hiding the restore affordance', () => {
    const { container, root } = renderPanel({ disabled: true });

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Сохранить как baseline'));
    const restoreButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Восстановить эту версию'));

    expect(createButton).toBeTruthy();
    expect(restoreButton).toBeTruthy();
    expect(createButton?.hasAttribute('data-disabled')).toBe(true);
    expect(restoreButton?.hasAttribute('data-disabled')).toBe(true);

    root.unmount();
  });
});
