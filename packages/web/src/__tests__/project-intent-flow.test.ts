import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const appSource = readFileSync(resolve(process.cwd(), 'packages/web/src/App.tsx'), 'utf8');
const projectSwitcherSource = readFileSync(resolve(process.cwd(), 'packages/web/src/components/ProjectSwitcher.tsx'), 'utf8');

describe('landing prompt flow orchestration', () => {
  it('launches project intent flow through a single server mutation', () => {
    assert.match(
      appSource,
      /fetch\(`\/api\/project-intents\/\$\{encodeURIComponent\(projectCreationIntentId\)\}\/launch`, \{\s*method: 'POST'/,
    );
    assert.doesNotMatch(
      appSource,
      /fetch\(`\/api\/project-intents\/\$\{encodeURIComponent\(projectCreationIntentId\)\}\/create-project`/,
    );
    assert.doesNotMatch(
      appSource,
      /fetch\(`\/api\/project-intents\/\$\{encodeURIComponent\(projectCreationIntentId\)\}\/start-generation`/,
    );
    assert.doesNotMatch(
      appSource,
      /fetch\(`\/api\/project-intents\/\$\{encodeURIComponent\(projectCreationIntentId\)\}`,\s*\{\s*headers:/,
    );
  });

  it('applies the launch payload directly to chat and generation state', () => {
    assert.match(appSource, /useChatStore\.getState\(\)\.addMessage\(\{ role: 'user', content: payload\.prompt\.trim\(\) \}\)/);
    assert.match(appSource, /setActiveGenerationJob\(payload\.job\)/);
    assert.match(appSource, /setPreparedIntentChatProjectId\(payload\.generationStarted \|\| payload\.job \?/);
    assert.match(appSource, /if \(payload\.archivedProject\) \{\s*showToast\(`Проект "\$\{payload\.archivedProject\.name\}" автоматически архивирован\.`\)/);
  });
});

describe('empty project stability', () => {
  it('keeps start screen visibility gated by generation state and explicit empty-project mode', () => {
    assert.match(appSource, /const showProjectStartScreen = workspace\.kind === 'project'[\s\S]*&& !activeProjectGenerationRunning[\s\S]*&& activeEmptyProjectModeProjectId !== workspace\.projectId;/);
    assert.match(appSource, /if \(activeGenerationJob\.status === 'succeeded' \|\| activeGenerationJob\.status === 'canceled'\) \{/);
  });
});

describe('project groups visibility', () => {
  it('renders empty project groups instead of hiding them', () => {
    assert.match(projectSwitcherSource, /if \(groupProjects\.length === 0\) \{/);
    assert.match(projectSwitcherSource, /<div className="px-3 py-2 text-xs text-slate-400">Нет проектов<\/div>/);
  });
});
