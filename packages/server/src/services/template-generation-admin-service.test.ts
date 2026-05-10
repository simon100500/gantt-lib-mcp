import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planTemplateSourceDependencyNormalization } from './template-generation-admin-service.js';

function makeTask(overrides: Partial<{
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  parentId: string | null;
  sortOrder: number;
  dependencies: Array<{ id: string; depTaskId: string; type: string; lag: number | null }>;
}> = {}) {
  return {
    id: overrides.id ?? 'task',
    name: overrides.name ?? overrides.id ?? 'task',
    startDate: overrides.startDate ?? new Date('2026-01-01T00:00:00.000Z'),
    endDate: overrides.endDate ?? new Date('2026-01-02T00:00:00.000Z'),
    parentId: overrides.parentId ?? null,
    sortOrder: overrides.sortOrder ?? 0,
    dependencies: overrides.dependencies ?? [],
  };
}

describe('planTemplateSourceDependencyNormalization', () => {
  it('keeps up to two cross-phase links and adds local links for hanging tasks inside a phase', () => {
    const tasks = [
      makeTask({ id: 'phase-a', sortOrder: 0 }),
      makeTask({ id: 'a-1', parentId: 'phase-a', sortOrder: 1, endDate: new Date('2026-01-03T00:00:00.000Z') }),
      makeTask({ id: 'a-2', parentId: 'phase-a', sortOrder: 2, endDate: new Date('2026-01-05T00:00:00.000Z') }),
      makeTask({ id: 'phase-b', sortOrder: 10 }),
      makeTask({
        id: 'b-1',
        parentId: 'phase-b',
        sortOrder: 11,
        startDate: new Date('2026-01-06T00:00:00.000Z'),
        dependencies: [
          { id: 'dep-a1-b1', depTaskId: 'a-1', type: 'FS', lag: 0 },
          { id: 'dep-a2-b1', depTaskId: 'a-2', type: 'FS', lag: 0 },
        ],
      }),
      makeTask({
        id: 'b-2',
        parentId: 'phase-b',
        sortOrder: 12,
        startDate: new Date('2026-01-08T00:00:00.000Z'),
        dependencies: [
          { id: 'dep-a2-b2', depTaskId: 'a-2', type: 'FS', lag: 0 },
          { id: 'dep-b1-b2', depTaskId: 'b-1', type: 'FS', lag: 0 },
        ],
      }),
      makeTask({
        id: 'b-3',
        parentId: 'phase-b',
        sortOrder: 13,
        startDate: new Date('2026-01-09T00:00:00.000Z'),
        dependencies: [],
      }),
    ];

    const plan = planTemplateSourceDependencyNormalization(tasks);

    assert.deepEqual(plan.dependencyIdsToPrune.sort(), ['dep-a2-b2']);
    assert.deepEqual(plan.dependenciesToCreate, [
      { taskId: 'a-2', depTaskId: 'a-1', type: 'FS', lag: 0 },
      { taskId: 'b-3', depTaskId: 'b-2', type: 'FS', lag: 0 },
    ]);
  });

  it('adds a cross-phase handoff when the next phase has no incoming link at all', () => {
    const tasks = [
      makeTask({ id: 'phase-a', sortOrder: 0 }),
      makeTask({ id: 'a-1', parentId: 'phase-a', sortOrder: 1, endDate: new Date('2026-01-03T00:00:00.000Z') }),
      makeTask({
        id: 'a-2',
        parentId: 'phase-a',
        sortOrder: 2,
        dependencies: [{ id: 'dep-a1-a2', depTaskId: 'a-1', type: 'FS', lag: 0 }],
      }),
      makeTask({ id: 'phase-b', sortOrder: 10 }),
      makeTask({ id: 'b-1', parentId: 'phase-b', sortOrder: 11 }),
    ];

    const plan = planTemplateSourceDependencyNormalization(tasks);

    assert.deepEqual(plan.dependencyIdsToPrune, []);
    assert.deepEqual(plan.dependenciesToCreate, [
      { taskId: 'b-1', depTaskId: 'a-2', type: 'FS', lag: 0 },
    ]);
  });
});
