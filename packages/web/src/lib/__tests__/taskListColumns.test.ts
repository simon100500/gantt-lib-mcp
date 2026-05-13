import { describe, expect, it } from 'vitest';

import { DEFAULT_HIDDEN_TASK_LIST_COLUMNS, normalizeHiddenTaskListColumns, resolveHiddenTaskListColumns } from '../taskListColumns.ts';

describe('task list column visibility resolution', () => {
  it('falls back to the compact default when neither user override nor project default exists', () => {
    expect(resolveHiddenTaskListColumns({
      userOverrideInitialized: false,
      userHiddenTaskListColumns: null,
      projectHiddenTaskListColumnsDefault: null,
    })).toEqual([...DEFAULT_HIDDEN_TASK_LIST_COLUMNS]);
  });

  it('uses the project default when there is no personal override', () => {
    expect(resolveHiddenTaskListColumns({
      userOverrideInitialized: false,
      projectHiddenTaskListColumnsDefault: ['status', 'dependencies'],
    })).toEqual(['status', 'dependencies']);
  });

  it('lets an explicit personal override win over the project default', () => {
    expect(resolveHiddenTaskListColumns({
      userOverrideInitialized: true,
      userHiddenTaskListColumns: ['progress'],
      projectHiddenTaskListColumnsDefault: ['status', 'dependencies'],
    })).toEqual(['progress']);
  });

  it('keeps an explicit empty project default as show-all instead of treating it as missing', () => {
    expect(resolveHiddenTaskListColumns({
      userOverrideInitialized: false,
      projectHiddenTaskListColumnsDefault: [],
    })).toEqual([]);
  });

  it('filters out unknown column ids', () => {
    expect(normalizeHiddenTaskListColumns(['status', 'unknown-column', 'dependencies'])).toEqual(['status', 'dependencies']);
  });
});
