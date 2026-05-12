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
  it('stages archive-and-create recovery instead of dropping the prompt on project limit', () => {
    assert.match(appSource, /stageArchiveAndCreateRecovery\(trimmedName, options\)/);
    assert.match(appSource, /archiveProjectId: auth\.project\.id/);
    assert.match(appSource, /archiveProjectName: auth\.project\.name/);
    assert.match(appSource, /submitLabel=\{effectivePendingProjectCreation\?\.archiveProjectId\s*\?\s*'Архивировать и создать'/);
  });

  it('opens create modal in archive mode immediately for free users with an active project', () => {
    assert.match(appSource, /const shouldStageArchiveImmediately = \(\s*\(billingStatus\?\.billingState === 'free' \|\| billingStatus == null\)/);
    assert.match(appSource, /shouldStageArchiveImmediately\s*\|\|/);
  });

  it('renders inline archive warning inside create project modal', () => {
    assert.match(createProjectModalSource, /archiveProjectName\?: string;/);
    assert.match(createProjectModalSource, /Проект "\{archiveProjectName\}" будет архивирован перед созданием нового\./);
  });

  it('suppresses generic create error when switching into archive recovery', () => {
    assert.match(appSource, /throw new Error\(ARCHIVE_AND_CREATE_RECOVERY\)/);
    assert.match(createProjectModalSource, /if \(err instanceof Error && err\.message === ARCHIVE_AND_CREATE_RECOVERY\) \{/);
  });

  it('forces archive mode at render time for free users even if pending modal state was plain', () => {
    assert.match(appSource, /const effectivePendingProjectCreation = showCreateProjectModal/);
    assert.match(appSource, /shouldForceArchiveMode && auth\.project/);
    assert.match(appSource, /archiveProjectName=\{effectivePendingProjectCreation\?\.archiveProjectName\}/);
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
