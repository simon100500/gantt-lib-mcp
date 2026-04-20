import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NORMALIZED_TOOL_CATALOG,
  NORMALIZED_TOOL_NAMES,
  type ToolCallContext,
  type ToolCallResult,
} from './index.js';

describe('tool-core catalog', () => {
  it('exposes the canonical normalized tool set and typed exports', () => {
    assert.deepEqual(NORMALIZED_TOOL_NAMES, [
      'get_project_summary',
      'get_schedule_slice',
      'find_tasks',
      'get_task_context',
      'create_tasks',
      'update_tasks',
      'move_tasks',
      'shift_tasks',
      'delete_tasks',
      'link_tasks',
      'unlink_tasks',
      'recalculate_project',
      'validate_schedule',
    ]);

    assert.equal(NORMALIZED_TOOL_CATALOG.length, NORMALIZED_TOOL_NAMES.length);
    assert.ok(
      NORMALIZED_TOOL_CATALOG.every((tool) => tool.handler && typeof tool.description === 'string' && tool.description.length > 0),
    );

    const context: ToolCallContext = {} as ToolCallContext;
    const result: ToolCallResult = { ok: true, data: { status: 'ok' } };

    assert.equal(typeof context, 'object');
    assert.deepEqual(result, { ok: true, data: { status: 'ok' } });
  });
});
