import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const appSource = readFileSync(resolve(process.cwd(), 'packages/web/src/App.tsx'), 'utf8');

describe('empty project intent prefill regression', () => {
  it('forces a switched target project to reopen with chat closed before showing the prefilled start screen', () => {
    assert.match(appSource, /const forceProjectWorkspaceOnNextSessionRef = useRef<string \| null>\(null\);/);
    assert.match(
      appSource,
      /if \(forceProjectWorkspaceOnNextSessionRef\.current === projectId\) \{[\s\S]*return \{ kind: 'project', projectId, chatOpen: false \};/,
    );
    assert.match(appSource, /forceProjectWorkspaceOnNextSessionRef\.current = newProject\.id;/);
    assert.match(appSource, /forceProjectWorkspaceOnNextSessionRef\.current = reusableEmptyProject\.id;/);
  });
});
