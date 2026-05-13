import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const lifecycleControllerSource = readFileSync(resolve(process.cwd(), 'packages/web/src/features/project-lifecycle/controller.ts'), 'utf8');
const generationSource = readFileSync(resolve(process.cwd(), 'packages/web/src/features/project-generation/useProjectGenerationController.ts'), 'utf8');

describe('empty project intent prefill regression', () => {
  it('forces a switched target project to reopen with chat closed before showing the prefilled start screen', () => {
    assert.match(generationSource, /const forceProjectWorkspaceOnNextSessionRef = useRef<string \| null>\(null\);/);
    assert.match(
      lifecycleControllerSource,
      /if \(forceProjectWorkspaceOnNextSessionRef\.current === projectId\) \{[\s\S]*return \{ kind: 'project', projectId, chatOpen: false \};/,
    );
    assert.match(lifecycleControllerSource, /forceProjectWorkspaceOnNextSessionRef\.current = newProject\.id;/);
    assert.match(lifecycleControllerSource, /forceProjectWorkspaceOnNextSessionRef\.current = reusableEmptyProject\.id;/);
  });
});
