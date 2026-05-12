import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const appSource = readFileSync(resolve(process.cwd(), 'packages/web/src/App.tsx'), 'utf8');
const projectSwitcherSource = readFileSync(resolve(process.cwd(), 'packages/web/src/components/ProjectSwitcher.tsx'), 'utf8');
const createProjectModalSource = readFileSync(resolve(process.cwd(), 'packages/web/src/components/CreateProjectModal.tsx'), 'utf8');

describe('landing prompt flow orchestration', () => {
  it('reads project intent text and routes it into the standard web flow', () => {
    assert.match(
      appSource,
      /fetch\(`\/api\/project-intents\/\$\{encodeURIComponent\(projectCreationIntentId\)\}`,\s*\{\s*headers:/,
    );
    assert.doesNotMatch(
      appSource,
      /fetch\(`\/api\/project-intents\/\$\{encodeURIComponent\(projectCreationIntentId\)\}\/launch`/,
    );
    assert.doesNotMatch(
      appSource,
      /fetch\(`\/api\/project-intents\/\$\{encodeURIComponent\(projectCreationIntentId\)\}\/create-project`/,
    );
    assert.match(
      appSource,
      /if \(\s*auth\.project[\s\S]*auth\.project\.taskCount === 0[\s\S]*setStartScreenPrefillPrompt\(prompt\)/,
    );
    assert.doesNotMatch(appSource, /handleSend\(prompt\)/);
  });

  it('opens the regular create-project flow when the current project is not reusable', () => {
    assert.match(appSource, /openCreateProjectModal\(\{\s*firstPrompt: prompt,/);
    assert.match(appSource, /initialProjectName: 'Новый проект'/);
  });

  it('passes landing prompt into the start screen input instead of chat autostart', () => {
    assert.match(appSource, /<DraftWorkspace[\s\S]*initialPrompt=\{startScreenPrefillPrompt \?\? undefined\}/);
    assert.match(createProjectModalSource, /archiveProjectName\?: string;/);
  });
});

describe('project creation recovery', () => {
  it('allows one active and up to four archived projects on free plan before paywall', () => {
    assert.match(appSource, /const FREE_ARCHIVED_PROJECT_LIMIT = 4;/);
    assert.match(appSource, /const activeProjectToReplace = auth\.projects\.find\(\(project\) => project\.status === 'active'\) \?\? null;/);
    assert.match(appSource, /const archivedProjectsCount = auth\.projects\.filter\(\(project\) => project\.status === 'archived'\)\.length;/);
    assert.match(appSource, /const canSilentlyReplaceOnFree = isFreePlanProjectReplacementMode[\s\S]*archivedProjectsCount < FREE_ARCHIVED_PROJECT_LIMIT;/);
  });

  it('keeps replacement quiet inside the regular create modal before the archive limit', () => {
    assert.match(appSource, /if \(\s*constraintDenial\.code === 'PROJECT_LIMIT_REACHED' && activeProjectToReplace[\s\S]*if \(canSilentlyReplaceOnFree\) \{/);
    assert.match(appSource, /setPendingProjectCreation\(\(current\) => \(\{[\s\S]*initialProjectName: current\?\.initialProjectName \?\? 'Новый проект',/);
    assert.doesNotMatch(appSource, /const stagedIntent = mustShowReplacementModal/);
  });

  it('renders inline archive warning inside create project modal', () => {
    assert.match(createProjectModalSource, /archiveProjectName\?: string;/);
    assert.match(createProjectModalSource, /Проект "\{archiveProjectName\}" при этом будет архивирован\./);
  });

  it('silently archives the active project before creation and shows paywall only after the limit', () => {
    assert.match(appSource, /!behavior\.skipProjectLimitRecovery[\s\S]*!options\.archiveProjectId[\s\S]*canSilentlyReplaceOnFree[\s\S]*await auth\.archiveProject\(activeProjectToReplace\.id\);/);
    assert.match(appSource, /if \(\s*!behavior\.skipProjectLimitRecovery[\s\S]*proactiveProjectDenial\?\.code === 'PROJECT_LIMIT_REACHED'[\s\S]*!canSilentlyReplaceOnFree\s*\) \{[\s\S]*await openLimitModal\(proactiveProjectDenial\);/);
  });

  it('prefills the start screen instead of auto-sending the first prompt to chat after project creation', () => {
    assert.match(appSource, /setStartScreenPrefillPrompt\(options\.firstPrompt \?\? null\);/);
    assert.doesNotMatch(appSource, /useChatStore\.getState\(\)\.addMessage\(\{ role: 'user', content: options\.firstPrompt \}\)/);
    assert.match(appSource, /chatOpen: options\.createEmptyChart[\s\S]*: false,/);
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
