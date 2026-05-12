import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const appSource = readFileSync(resolve(process.cwd(), 'packages/web/src/App.tsx'), 'utf8');
const projectSwitcherSource = readFileSync(resolve(process.cwd(), 'packages/web/src/components/ProjectSwitcher.tsx'), 'utf8');
const createProjectModalSource = readFileSync(resolve(process.cwd(), 'packages/web/src/components/CreateProjectModal.tsx'), 'utf8');
const deleteProjectGroupModalSource = readFileSync(resolve(process.cwd(), 'packages/web/src/components/DeleteProjectGroupModal.tsx'), 'utf8');

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
      /const reusableEmptyProject = auth\.projects\.find\(\(project\) => project\.status === 'active' && project\.taskCount === 0\) \?\? null;/,
    );
    assert.doesNotMatch(appSource, /handleSend\(prompt\)/);
  });

  it('opens the regular create-project flow when the current project is not reusable', () => {
    assert.match(appSource, /openCreateProjectModal\(\{\s*firstPrompt: prompt,/);
    assert.match(appSource, /initialProjectName: 'Новый проект'/);
    assert.match(appSource, /if \(effectiveProjectDenial\) \{[\s\S]*await openLimitModal\(effectiveProjectDenial\);/);
  });

  it('passes landing prompt into the start screen input instead of chat autostart', () => {
    assert.match(appSource, /<DraftWorkspace[\s\S]*initialPrompt=\{startScreenPrefillPrompt \?\? undefined\}/);
    assert.match(createProjectModalSource, /archiveProjectName\?: string;/);
  });
});

describe('project creation recovery', () => {
  it('allows one active and up to four archived projects on free plan before paywall', () => {
    assert.match(appSource, /const FREE_ARCHIVED_PROJECT_LIMIT = 4;/);
    assert.match(appSource, /function mergeProjectsForLimitEvaluation\(projects: AuthProject\[\], currentProject: AuthProject \| null\): AuthProject\[\] \{/);
    assert.match(appSource, /const projectsForLimitEvaluation = mergeProjectsForLimitEvaluation\(auth\.projects, auth\.project \?\? null\);/);
    assert.match(appSource, /const activeProjectToReplace = projectsForLimitEvaluation\.find\(\(project\) => project\.status === 'active'\) \?\? null;/);
    assert.match(appSource, /const activeProjectsCount = projectsForLimitEvaluation\.filter\(\(project\) => project\.status === 'active'\)\.length;/);
    assert.match(appSource, /const archivedProjectsCount = projectsForLimitEvaluation\.filter\(\(project\) => project\.status === 'archived'\)\.length;/);
    assert.match(appSource, /const canSilentlyReplaceOnFree = isFreePlanProjectReplacementMode[\s\S]*archivedProjectsCount < FREE_ARCHIVED_PROJECT_LIMIT;/);
    assert.match(appSource, /const effectiveProjectDenial = isFreePlanProjectReplacementMode[\s\S]*\? localProjectLimitDenial[\s\S]*: proactiveProjectDenial;/);
    assert.match(appSource, /const effectiveArchiveDenial = localArchiveLimitDenial \?\? proactiveArchiveDenial;/);
  });

  it('keeps replacement quiet inside the regular create modal before the archive limit', () => {
    assert.match(appSource, /if \(\s*constraintDenial\.code === 'PROJECT_LIMIT_REACHED' && activeProjectToReplace[\s\S]*if \(canSilentlyReplaceOnFree\) \{/);
    assert.match(appSource, /setPendingProjectCreation\(\(current\) => \(\{[\s\S]*initialProjectName: current\?\.initialProjectName \?\? 'Новый проект',/);
    assert.match(appSource, /const stagedIntent = canSilentlyReplaceOnFree && activeProjectToReplace/);
    assert.match(appSource, /archiveProjectName: nextIntent\.archiveProjectName \?\? activeProjectToReplace\.name/);
  });

  it('renders inline archive warning inside create project modal', () => {
    assert.match(createProjectModalSource, /archiveProjectName\?: string;/);
    assert.match(createProjectModalSource, /Проект "\{archiveProjectName\}" при этом будет архивирован\./);
  });

  it('silently archives the active project before creation and shows paywall only after the limit', () => {
    assert.match(appSource, /!behavior\.skipProjectLimitRecovery[\s\S]*!options\.archiveProjectId[\s\S]*canSilentlyReplaceOnFree[\s\S]*await auth\.archiveProject\(activeProjectToReplace\.id\);/);
    assert.match(appSource, /await fetchUsage\(\);\s*await auth\.refreshProjects\(\);/);
    assert.match(appSource, /if \(\s*!behavior\.skipProjectLimitRecovery[\s\S]*effectiveProjectDenial\?\.code === 'PROJECT_LIMIT_REACHED'[\s\S]*!canSilentlyReplaceOnFree\s*\) \{[\s\S]*await openLimitModal\(effectiveProjectDenial\);/);
  });

  it('decides modal vs paywall from local project state before the create request fails', () => {
    assert.match(appSource, /function buildLocalFreeProjectLimitDenial\(/);
    assert.match(appSource, /const effectiveProjectDenial = isFreePlanProjectReplacementMode[\s\S]*\? localProjectLimitDenial[\s\S]*: proactiveProjectDenial;/);
    assert.match(appSource, /if \(auth\.isAuthenticated\) \{[\s\S]*if \(\s*effectiveProjectDenial\?\.code === 'PROJECT_LIMIT_REACHED'[\s\S]*canSilentlyReplaceOnFree[\s\S]*openCreateProjectModal/);
    assert.match(appSource, /if \(effectiveProjectDenial\) \{[\s\S]*await openLimitModal\(effectiveProjectDenial\);/);
    assert.match(appSource, /const immediateDenial = normalizeConstraintDenialPayload\(denial, currentBillingStatus\);[\s\S]*setLimitModal\(\{[\s\S]*denial: immediateDenial,/);
  });

  it('refreshes projects after archive and restore so limits update without reload', () => {
    assert.match(appSource, /function buildLocalArchiveLimitDenial\(/);
    assert.match(appSource, /const handleArchiveProject = useCallback\(async \(projectId: string\) => \{[\s\S]*if \(effectiveArchiveDenial\) \{[\s\S]*await openLimitModal\(effectiveArchiveDenial\);[\s\S]*return false;[\s\S]*await auth\.archiveProject\(projectId\);[\s\S]*await fetchUsage\(\);[\s\S]*await auth\.refreshProjects\(\);[\s\S]*return true;/);
    assert.match(appSource, /const handleRestoreProject = useCallback\(async \(projectId: string\) => \{[\s\S]*await auth\.restoreProject\(projectId\);[\s\S]*await fetchUsage\(\);[\s\S]*await auth\.refreshProjects\(\);/);
    assert.match(appSource, /<DeleteProjectModal[\s\S]*await auth\.deleteProject\(deleteProjectDraft\.id\);[\s\S]*await auth\.refreshProjects\(\);[\s\S]*await fetchUsage\(\);[\s\S]*setLimitModal\(null\);/);
  });

  it('prefills the start screen instead of auto-sending the first prompt to chat after project creation', () => {
    assert.match(appSource, /await auth\.switchProject\(newProject\.id\);[\s\S]*setStartScreenPrefillPrompt\(options\.firstPrompt \?\? null\);/);
    assert.doesNotMatch(appSource, /useChatStore\.getState\(\)\.addMessage\(\{ role: 'user', content: options\.firstPrompt \}\)/);
    assert.match(appSource, /chatOpen: options\.createEmptyChart[\s\S]*: false,/);
  });

  it('uses the standard send path from an empty project workspace after intent prefill', () => {
    assert.match(appSource, /if \(workspace\.kind === 'project'\) \{[\s\S]*const result = handleSend\(text\);[\s\S]*return result;/);
    assert.match(appSource, /if \(workspace\.kind !== 'project' && !auth\.project\) \{/);
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

  it('shows destructive group deletion confirmation and keeps group creation affordances behind paywall on free', () => {
    assert.match(projectSwitcherSource, /projectCount=\{group\.projectCount \?\? groupProjects\.length\}/);
    assert.match(createProjectModalSource, /onCreateGroup\?: \(name: string\) => Promise<ProjectGroup \| null>;/);
    assert.match(createProjectModalSource, /\{onCreateGroup \? \(/);
    assert.match(deleteProjectGroupModalSource, /Вместе с ней будут удалены все проекты в группе/);
    assert.match(appSource, /const isProjectGroupsLockedOnCurrentPlan = billingStatus == null/);
    assert.match(appSource, /billingStatus\.plan === 'free' && billingStatus\.billingState !== 'trial_active'/);
    assert.match(appSource, /code: 'PROJECT_GROUPS_FEATURE_LOCKED'/);
    assert.match(appSource, /onCreateProjectGroup=\{handleCreateProjectGroup\}/);
    assert.match(appSource, /onCreateGroup=\{async \(name\) => \{/);
  });
});
