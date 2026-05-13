import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const workspaceSource = readFileSync(resolve(process.cwd(), 'packages/web/src/features/workspace/WorkspaceShell.tsx'), 'utf8');

describe('empty project intent prefill regression', () => {
  it('forces a switched target project to reopen with chat closed before showing the prefilled start screen', () => {
    assert.match(workspaceSource, /const forceProjectWorkspaceOnNextSessionRef = useRef<string \| null>\(null\);/);
    assert.match(
      workspaceSource,
      /if \(forceProjectWorkspaceOnNextSessionRef\.current === projectId\) \{[\s\S]*return \{ kind: 'project', projectId, chatOpen: false \};/,
    );
    assert.match(workspaceSource, /forceProjectWorkspaceOnNextSessionRef\.current = newProject\.id;/);
    assert.match(workspaceSource, /forceProjectWorkspaceOnNextSessionRef\.current = reusableEmptyProject\.id;/);
  });
});
