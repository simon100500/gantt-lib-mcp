import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useAutoSave } from './useAutoSave';
import type { Task } from '../types';

describe('useAutoSave - Client-Authoritative', () => {
  const accessToken = 'token-1';
  const clientId = 'client-1';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends PUT request with full tasks array', async () => {
    const tasks: Task[] = [
      { id: 'task-1', name: 'Task 1', startDate: '2026-03-10', endDate: '2026-03-11', order: 0 },
      { id: 'task-2', name: 'Task 2', startDate: '2026-03-12', endDate: '2026-03-13', order: 1 },
    ];

    const { rerender } = renderHook(
      ({ tasks, token }) => useAutoSave(tasks, token, clientId),
      { initialProps: { tasks: [] as Task[], token: accessToken as string | null } },
    );

    rerender({ tasks, token: accessToken });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }),
    }));

    // Verify body contains full task array
    const fetchCall = (vi.mocked(fetch).mock.calls[0] as unknown)[1] as RequestInit;
    const body = JSON.parse(fetchCall.body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe('task-1');
    expect(body[1].id).toBe('task-2');
  });

  it('does not send X-Client-Id header', async () => {
    const tasks: Task[] = [
      { id: 'task-1', name: 'Task 1', startDate: '2026-03-10', endDate: '2026-03-11', order: 0 },
    ];

    const { rerender } = renderHook(
      ({ tasks, token }) => useAutoSave(tasks, token, clientId),
      { initialProps: { tasks: [] as Task[], token: accessToken as string | null } },
    );

    rerender({ tasks, token: accessToken });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const fetchCall = (vi.mocked(fetch).mock.calls[0] as unknown)[1] as RequestInit;
    expect(fetchCall.headers).not.toHaveProperty('X-Client-Id');
  });

  it('debounces rapid changes', async () => {
    const tasks: Task[] = [
      { id: 'task-1', name: 'Task 1', startDate: '2026-03-10', endDate: '2026-03-11', order: 0 },
    ];

    const { rerender } = renderHook(
      ({ tasks, token }) => useAutoSave(tasks, token, clientId),
      { initialProps: { tasks: [] as Task[], token: accessToken as string | null } },
    );

    // Rapid changes
    rerender({ tasks, token: accessToken });
    rerender({ tasks: [{ ...tasks[0], name: 'Changed 1' }], token: accessToken });
    rerender({ tasks: [{ ...tasks[0], name: 'Changed 2' }], token: accessToken });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    // Should only send one request
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not save when accessToken is null', async () => {
    const tasks: Task[] = [
      { id: 'task-1', name: 'Task 1', startDate: '2026-03-10', endDate: '2026-03-11', order: 0 },
    ];

    renderHook(
      ({ tasks, token }) => useAutoSave(tasks, token, clientId),
      { initialProps: { tasks, token: null as string | null } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});
