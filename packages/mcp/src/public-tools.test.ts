import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_SCHEDULING_TOOL_NAMES, PUBLIC_MCP_TOOLS } from './public-tools.js';

describe('public MCP scheduling surface', () => {
  it('exposes only normalized scheduling tool names', () => {
    const toolNames = PUBLIC_MCP_TOOLS.map((tool) => tool.name as string);

    assert.ok(toolNames.includes('get_project_summary'));
    assert.ok(toolNames.includes('get_task_context'));
    assert.ok(toolNames.includes('get_schedule_slice'));
    assert.ok(toolNames.includes('create_tasks'));
    assert.ok(toolNames.includes('update_tasks'));
    assert.ok(toolNames.includes('move_tasks'));
    assert.ok(toolNames.includes('delete_tasks'));
    assert.ok(toolNames.includes('link_tasks'));
    assert.ok(toolNames.includes('unlink_tasks'));
    assert.ok(toolNames.includes('shift_tasks'));
    assert.ok(toolNames.includes('recalculate_project'));
    assert.ok(toolNames.includes('validate_schedule'));

    for (const legacyName of LEGACY_SCHEDULING_TOOL_NAMES) {
      assert.ok(!toolNames.includes(legacyName), `legacy tool leaked into public list: ${legacyName}`);
    }
  });
});
