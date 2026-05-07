// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { Toolbar, type ToolbarBaselineRow } from '../Toolbar.tsx';
import { useUIStore } from '../../../stores/useUIStore.ts';

function installDomPolyfills(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  });

  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  });

  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
  });

  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: (handle: number) => window.clearTimeout(handle),
  });

  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    writable: true,
    value: () => false,
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: function scrollIntoView(): void {},
  });

  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    writable: true,
    value: function releasePointerCapture(): void {},
  });

  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    writable: true,
    value: function setPointerCapture(): void {},
  });

  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value: function getBoundingClientRect(): DOMRect {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 160,
        bottom: 32,
        width: 160,
        height: 32,
        toJSON: () => ({}),
      } as DOMRect;
    },
  });
}

beforeAll(() => {
  installDomPolyfills();
});

afterEach(() => {
  act(() => {
    document.body.innerHTML = '';
  });
  vi.restoreAllMocks();
  useUIStore.setState({
    viewMode: 'day',
    showTaskList: true,
    showChart: true,
    autoSchedule: true,
    highlightExpiredTasks: true,
    disableTaskDrag: false,
    showHistoryPanel: false,
    filterWithoutDeps: false,
    filterExpired: false,
    filterSearchText: '',
    filterDateFrom: '',
    filterDateTo: '',
  });
});

interface RenderOptions {
  baselineRows?: ToolbarBaselineRow[] | null;
  baselineActiveLabel?: string | null;
  baselineLoading?: boolean | null;
  baselineError?: string | null;
  baselineEmptyLabel?: string | null;
  baselineCreateLabel?: string | null;
  creatingBaselineFromCurrent?: boolean | null;
  deletingBaselineId?: string | null;
  baselineMenuOpen?: boolean;
  onCreateBaselineFromCurrent?: (() => void) | null;
  onSelectBaseline?: (baselineId: string) => void;
  onDeleteBaseline?: (baselineId: string) => void;
  onRefreshBaselines?: () => void;
}

function renderToolbar({
  baselineRows = [],
  baselineActiveLabel = null,
  baselineLoading = false,
  baselineError = null,
  baselineEmptyLabel = 'Список пуст',
  baselineCreateLabel = 'Сохранить текущий график',
  creatingBaselineFromCurrent = false,
  deletingBaselineId = null,
  baselineMenuOpen = false,
  onCreateBaselineFromCurrent = vi.fn(),
  onSelectBaseline = vi.fn(),
  onDeleteBaseline = vi.fn(),
  onRefreshBaselines = vi.fn(),
}: RenderOptions = {}): {
  container: HTMLDivElement;
  root: Root;
  onCreateBaselineFromCurrent: (() => void) | null;
  onSelectBaseline: (baselineId: string) => void;
  onDeleteBaseline: (baselineId: string) => void;
  onRefreshBaselines: () => void;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  act(() => {
    root.render(
      <Toolbar
        onScrollToToday={() => {}}
        onCollapseAll={() => {}}
        onExpandAll={() => {}}
        baselineRows={baselineRows}
        baselineActiveLabel={baselineActiveLabel}
        baselineLoading={baselineLoading}
        baselineError={baselineError}
        baselineEmptyLabel={baselineEmptyLabel}
        baselineCreateLabel={baselineCreateLabel}
        creatingBaselineFromCurrent={creatingBaselineFromCurrent}
        deletingBaselineId={deletingBaselineId}
        baselineMenuOpen={baselineMenuOpen}
        onBaselineMenuOpenChange={() => {}}
        onCreateBaselineFromCurrent={onCreateBaselineFromCurrent}
        onSelectBaseline={onSelectBaseline}
        onDeleteBaseline={onDeleteBaseline}
        onRefreshBaselines={onRefreshBaselines}
      />,
    );
  });

  return { container, root, onCreateBaselineFromCurrent, onSelectBaseline, onDeleteBaseline, onRefreshBaselines };
}

function menuText(): string {
  return document.body.textContent ?? '';
}

describe('Toolbar baseline menu', () => {
  it('renders the desktop trigger with create, active baseline label, and selected-row marker', () => {
    const onCreateBaselineFromCurrent = vi.fn();
    const onSelectBaseline = vi.fn();
    const onDeleteBaseline = vi.fn();
    const onRefreshBaselines = vi.fn();

    const { container, root } = renderToolbar({
      baselineMenuOpen: true,
      baselineActiveLabel: 'Sprint plan v1',
      baselineRows: [
        { id: 'baseline-1', label: 'Sprint plan v1', selected: true },
        { id: 'baseline-2', label: 'Forecast copy', selected: false },
      ],
      onCreateBaselineFromCurrent,
      onSelectBaseline,
      onDeleteBaseline,
      onRefreshBaselines,
    });

    expect(container.textContent).not.toContain('Baseline: Sprint plan v1');
    expect(menuText()).toContain('Сохранить текущий график');
    expect(menuText()).toContain('Базовый план');
    expect(menuText()).toContain('Sprint plan v1');
    expect(menuText()).toContain('Forecast copy');
    expect(menuText()).toContain('Обновить базовые планы');

    const createItem = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((node) => node.textContent?.includes('Сохранить текущий график'));
    act(() => {
      createItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCreateBaselineFromCurrent).toHaveBeenCalledTimes(1);

    const selectedRow = Array.from(document.body.querySelectorAll('button')).find((node) => node.textContent?.includes('Sprint plan v1'));
    expect(selectedRow?.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      selectedRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelectBaseline).toHaveBeenCalledWith('baseline-1');

    const deleteItem = Array.from(document.body.querySelectorAll('button')).find((node) => {
      const text = node.getAttribute('aria-label') ?? '';
      return text.includes('Удалить базовый план');
    });
    act(() => {
      deleteItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const confirmDelete = Array.from(document.body.querySelectorAll('button')).find((node) => node.textContent?.includes('Удалить'));
    act(() => {
      confirmDelete?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDeleteBaseline).toHaveBeenCalledWith('baseline-1');

    const refreshItem = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((node) => node.textContent?.includes('Обновить базовые планы'));
    act(() => {
      refreshItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onRefreshBaselines).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it('renders explicit loading, error, empty, create-in-flight, and delete-in-flight states without crashing', () => {
    const loadingRender = renderToolbar({ baselineMenuOpen: true, baselineLoading: true, baselineRows: null, baselineError: null });
    expect(menuText()).toContain('Загрузка базовых планов…');
    expect(menuText()).toContain('Сохранить текущий график');
    loadingRender.root.unmount();

    const errorRender = renderToolbar({ baselineMenuOpen: true, baselineError: 'Не удалось загрузить baseline-ы', baselineRows: [] });
    expect(menuText()).toContain('Не удалось загрузить baseline-ы');
    expect(menuText()).toContain('Сохранить текущий график');
    errorRender.root.unmount();

    const emptyRender = renderToolbar({ baselineMenuOpen: true, baselineRows: [], baselineEmptyLabel: 'Сохранённых baseline-ов пока нет' });
    expect(menuText()).toContain('Сохранить текущий график');
    emptyRender.root.unmount();

    const creatingRender = renderToolbar({
      baselineMenuOpen: true,
      creatingBaselineFromCurrent: true,
      baselineRows: [],
      onCreateBaselineFromCurrent: null,
    });
    const createItem = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((node) => {
      const text = node.textContent ?? '';
      return text.includes('Сохранить текущий график');
    });
    expect(createItem?.getAttribute('data-disabled')).toBe('');
    expect(menuText()).toContain('Сохранить текущий график…');
    act(() => {
      creatingRender.root.unmount();
    });

    const deletingRender = renderToolbar({
      baselineMenuOpen: true,
      baselineActiveLabel: 'Delete me',
      baselineRows: [{ id: 'baseline-delete', label: 'Delete me', selected: true }],
      deletingBaselineId: 'baseline-delete',
      onDeleteBaseline: undefined,
    });
    const deleteItem = Array.from(document.body.querySelectorAll('button')).find((node) => {
      const text = node.getAttribute('aria-label') ?? '';
      return text.includes('Удаляем базовый план…');
    });
    expect(deleteItem?.hasAttribute('disabled')).toBe(true);
    act(() => {
      deletingRender.root.unmount();
    });
  });

  it('falls back safely when active label and create props are malformed', () => {
    const { container, root } = renderToolbar({
      baselineMenuOpen: true,
      baselineActiveLabel: '   ',
      baselineRows: [
        { id: 'baseline-1', label: '', selected: false },
      ],
      baselineLoading: null,
      baselineError: null,
      baselineEmptyLabel: null,
      baselineCreateLabel: '   ',
      onCreateBaselineFromCurrent: null,
    });

    expect(container.textContent).not.toContain('Baseline');
    const idleTrigger =
      container.querySelector('button[title="Выбрать базовый план"]') ??
      container.querySelector('button[aria-label="Меню базовых планов"]');
    expect(idleTrigger?.getAttribute('title')).toBe('Меню базовых планов');
    expect(menuText()).toContain('Без названия');
    expect(menuText()).toContain('Сохранить текущий график');

    const createItem = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((node) => {
      const text = node.textContent ?? '';
      return text.includes('Сохранить текущий график');
    });
    expect(createItem?.getAttribute('data-disabled')).toBe('');

    act(() => {
      root.unmount();
    });
  });

  it('mirrors baseline create/select actions in the mobile overflow menu', () => {
    const onCreateBaselineFromCurrent = vi.fn();
    const onSelectBaseline = vi.fn();
    const onRefreshBaselines = vi.fn();

    const { container, root } = renderToolbar({
      baselineRows: [{ id: 'baseline-1', label: 'Mobile baseline', selected: true }],
      baselineActiveLabel: 'Mobile baseline',
      onCreateBaselineFromCurrent,
      onSelectBaseline,
      onRefreshBaselines,
    });

    const moreTrigger = Array.from(container.querySelectorAll('button')).find((node) => node.getAttribute('title') === 'Ещё');
    expect(moreTrigger).toBeDefined();

    act(() => {
      moreTrigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      moreTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('Базовый план');
    expect(document.body.textContent).toContain('Сохранить текущий график');
    expect(document.body.textContent).toContain('Mobile baseline');
    expect(document.body.textContent).toContain('Обновить базовые планы');

    const selectedRow = Array.from(document.body.querySelectorAll('button')).find((node) => {
      const text = node.textContent ?? '';
      return text.includes('Mobile baseline');
    });
    expect(selectedRow).toBeDefined();

    const createItem = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((node) => node.textContent?.includes('Сохранить текущий график'));
    expect(createItem).toBeDefined();

    act(() => {
      selectedRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelectBaseline).toHaveBeenCalledWith('baseline-1');

    act(() => {
      createItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCreateBaselineFromCurrent).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });
});
