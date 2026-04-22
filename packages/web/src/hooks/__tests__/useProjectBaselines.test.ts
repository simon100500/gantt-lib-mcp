import { describe, expect, it } from 'vitest';

import type { BaselineItem } from '../../lib/apiTypes.ts';
import { __baselineHookInternals } from '../useProjectBaselines.ts';

const { normalizeBaselineItem, normalizeSnapshot, parseBaselineListResponse, parseBaselineSnapshotResponse, normalizeRequestError } = __baselineHookInternals;

function createJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });
}

describe('useProjectBaselines internals', () => {
  it('normalizes malformed list payloads to safe baseline defaults', async () => {
    const response = createJsonResponse({
      baselines: [
        {
          id: 'baseline-1',
          projectId: 'project-1',
          name: 'Saved baseline',
          source: 'history',
          sourceHistoryGroupId: 'group-1',
          createdAt: '2026-04-22T00:00:00.000Z',
        },
        {
          source: 'unexpected',
          sourceHistoryGroupId: 123,
          createdAt: null,
        },
      ],
    });

    const data = await parseBaselineListResponse(response);

    expect(data.baselines).toEqual<BaselineItem[]>([
      {
        id: 'baseline-1',
        projectId: 'project-1',
        name: 'Saved baseline',
        source: 'history',
        sourceHistoryGroupId: 'group-1',
        createdAt: '2026-04-22T00:00:00.000Z',
      },
      {
        id: '',
        projectId: '',
        name: '',
        source: 'current',
        sourceHistoryGroupId: null,
        createdAt: '',
      },
    ]);
  });

  it('normalizes snapshot payloads with missing dependency arrays', async () => {
    const response = createJsonResponse({
      id: 'baseline-2',
      projectId: 'project-1',
      name: 'Current snapshot',
      source: 'current',
      sourceHistoryGroupId: null,
      createdAt: '2026-04-22T00:00:00.000Z',
      snapshot: {
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            startDate: '2026-04-01',
            endDate: '2026-04-02',
          },
        ],
      },
    });

    const data = await parseBaselineSnapshotResponse(response);

    expect(data.snapshot.tasks).toHaveLength(1);
    expect(data.snapshot.dependencies).toEqual([]);
  });

  it('returns empty snapshot arrays when payload is malformed', () => {
    expect(normalizeSnapshot(undefined)).toEqual({ tasks: [], dependencies: [] });
    expect(normalizeSnapshot({ tasks: 'nope' as never, dependencies: null as never })).toEqual({ tasks: [], dependencies: [] });
  });

  it('maps abort errors to a readable timeout message', () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const normalized = normalizeRequestError(abortError, 'fallback');

    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.message).toBe('Request timed out');
  });

  it('preserves explicit error messages for network and server failures', () => {
    expect(normalizeRequestError(new Error('Failed to fetch'), 'fallback').message).toBe('Failed to fetch');
    expect(normalizeRequestError('unexpected', 'fallback').message).toBe('fallback');
  });

  it('normalizes individual baseline items with safe defaults', () => {
    expect(normalizeBaselineItem(undefined)).toEqual({
      id: '',
      projectId: '',
      name: '',
      source: 'current',
      sourceHistoryGroupId: null,
      createdAt: '',
    });
  });
});
