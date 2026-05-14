// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectHistory } from '../useProjectHistory.ts';
import { useHistoryViewerStore } from '../../stores/useHistoryViewerStore.ts';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function HistoryProbe({ projectId }: { projectId: string }) {
  const history = useProjectHistory('token', true, projectId);

  return (
    <div>
      <span data-testid="loading">{String(history.loading)}</span>
      <span data-testid="items">{history.items.map((item) => item.title).join(',')}</span>
    </div>
  );
}

function renderProbe(projectId: string): { container: HTMLDivElement; root: Root; rerender: (nextProjectId: string) => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  const rerender = (nextProjectId: string) => {
    act(() => {
      root.render(<HistoryProbe projectId={nextProjectId} />);
    });
  };

  rerender(projectId);

  return { container, root, rerender };
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (err) {
      lastError = err;
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    }
  }

  throw lastError;
}

function createHistoryResponse(projectId: string | null, title: string): Response {
  return {
    ok: true,
    json: async () => ({
      items: [
        {
          id: `${projectId ?? 'active'}-history`,
          actorType: 'user',
          title,
          createdAt: '2026-04-22T10:00:00.000Z',
          baseVersion: 1,
          newVersion: 2,
          commandCount: 1,
          isCurrent: true,
          canRestore: false,
        },
      ],
      nextCursor: undefined,
      canRedo: false,
      redoGroupId: null,
    }),
  } as Response;
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

describe('useProjectHistory', () => {
  beforeEach(() => {
    useHistoryViewerStore.setState({ historyViewer: { mode: 'inactive' } });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const projectId = url.searchParams.get('projectId');
      const title = projectId === 'project-2' ? 'resize_task' : 'move_task';

      return createHistoryResponse(projectId, title);
    }));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('reloads visible history when the project scope changes', async () => {
    const { container, root, rerender } = renderProbe('project-1');

    await waitFor(() => {
      expect(container.textContent).toContain('move_task');
      expect(container.textContent).toContain('initial');
    });

    rerender('project-2');

    await waitFor(() => {
      expect(container.textContent).toContain('resize_task');
      expect(container.textContent).toContain('initial');
      expect(container.textContent).not.toContain('move_task');
    });

    const requestedUrls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((call) => String(call[0]));
    expect(requestedUrls).toContain('/api/history?limit=20&projectId=project-1');
    expect(requestedUrls).toContain('/api/history?limit=20&projectId=project-2');

    root.unmount();
  });

  it('ignores stale responses from a previous project scope', async () => {
    const projectOneResponse = createDeferred<Response>();
    const projectTwoResponse = createDeferred<Response>();

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const projectId = url.searchParams.get('projectId');

      return projectId === 'project-2'
        ? projectTwoResponse.promise
        : projectOneResponse.promise;
    });

    const { container, root, rerender } = renderProbe('project-1');

    rerender('project-2');

    projectTwoResponse.resolve(createHistoryResponse('project-2', 'resize_task'));
    await waitFor(() => {
      expect(container.textContent).toContain('resize_task');
    });

    projectOneResponse.resolve(createHistoryResponse('project-1', 'move_task'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('resize_task');
    expect(container.textContent).not.toContain('move_task');

    root.unmount();
  });
});
