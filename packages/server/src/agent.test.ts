import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMutationIntent } from './agent.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('agent hierarchy mutation intent', () => {
  it('treats Russian nesting requests as mutations', () => {
    assert.equal(
      isMutationIntent('\u0421\u0434\u0435\u043b\u0430\u0439 \u0432\u043b\u043e\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c: \u043f\u0435\u0440\u0435\u043d\u0435\u0441\u0438 \u0437\u0430\u0434\u0430\u0447\u0443 "\u042d\u043b\u0435\u043a\u0442\u0440\u0438\u043a\u0430" \u0432\u043d\u0443\u0442\u0440\u044c "\u042d\u0442\u0430\u0436 2"'),
      true,
    );
    assert.equal(
      isMutationIntent('\u0421\u0434\u0435\u043b\u0430\u0439 "\u042d\u043b\u0435\u043a\u0442\u0440\u0438\u043a\u0430" \u043f\u043e\u0434\u0437\u0430\u0434\u0430\u0447\u0435\u0439 \u0434\u043b\u044f "\u042d\u0442\u0430\u0436 2"'),
      true,
    );
  });

  it('treats English hierarchy requests as mutations', () => {
    assert.equal(isMutationIntent('Nest Plumbing under Floor 2'), true);
    assert.equal(isMutationIntent('Move Finishing under Phase B as a child task'), true);
  });
});

describe('agent system prompt hierarchy guidance', () => {
  it('documents parentId workflow for nesting', () => {
    const promptPath = join(__dirname, '../../mcp/agent/prompts/system.md');
    const prompt = readFileSync(promptPath, 'utf-8');

    assert.match(prompt, /Hierarchy Rules/);
    assert.match(prompt, /parentId/);
    assert.match(prompt, /subtasks|child tasks|nested work/i);
    assert.match(prompt, /empty string/i);
  });

  it('documents container-first planning and validation', () => {
    const promptPath = join(__dirname, '../../mcp/agent/prompts/system.md');
    const prompt = readFileSync(promptPath, 'utf-8');

    assert.match(prompt, /Find the container/i);
    assert.match(prompt, /WBS fragment/i);
    assert.match(prompt, /Validate before finishing/i);
    assert.match(prompt, /Avoid duplicates/i);
  });
});
