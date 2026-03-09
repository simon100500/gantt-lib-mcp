---
phase: quick-012
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/App.tsx
autonomous: true
requirements: [QUICK-12]

must_haves:
  truths:
    - "Guest who renamed their project and then logs in sees their custom project name in the header, not 'Default Project'"
    - "Project name rename request is sent to server only when name differs from default"
  artifacts:
    - path: "packages/web/src/App.tsx"
      provides: "PATCH /api/projects/:id call after task import in OTP onSuccess"
  key_links:
    - from: "App.tsx OTP onSuccess"
      to: "PATCH /api/projects/:id"
      via: "fetch after PUT /api/tasks succeeds"
      pattern: "PATCH.*api/projects"
---

<objective>
Fix the project name not being transferred when a guest logs in.

When a guest renames their local project and then authenticates via OTP, the server creates the project
with a default name. Quick task 11 already saves local tasks to the server on login — this task adds
the analogous step for the project name: after a successful task import, rename the server project to
match the locally stored name.

Purpose: Guests who invest effort naming their project should not lose that work on login.
Output: One additional PATCH /api/projects/:id call in the existing onSuccess block in App.tsx.
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<!-- Key interfaces needed by executor: -->
<interfaces>
From packages/web/src/hooks/useLocalTasks.ts:
  projectName: string          — read via localTasks.projectName
  PROJECT_NAME_KEY = 'gantt_project_name'
  Default value: 'Мой проект'

Server endpoint:
  PATCH /api/projects/:id
  Body: { name: string }
  Auth: Bearer token
  Returns: { project: { id, name } }

In OTP onSuccess callback (App.tsx ~line 450):
  result.accessToken  — use directly (state is async)
  result.project.id   — server-created project ID
  localTasks.projectName — guest's locally stored name
  localTasks.isDemoMode  — true = user never edited, false = user edited
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename server project to match local name after login</name>
  <files>packages/web/src/App.tsx</files>
  <action>
    In the OTP onSuccess callback (around line 454–472), extend the existing task-import block to also
    rename the server project when the local name differs from the default.

    Current block condition: `!localTasks.isDemoMode && localTasks.tasks.length > 0`

    After the PUT /api/tasks succeeds (inside the try block, after clearing localStorage), add:

    ```typescript
    // Transfer project name if guest renamed it
    const DEFAULT_NAME = 'Мой проект';
    if (localTasks.projectName && localTasks.projectName !== DEFAULT_NAME) {
      await fetch(`/api/projects/${result.project.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${result.accessToken}`,
        },
        body: JSON.stringify({ name: localTasks.projectName }),
      });
      // Update auth state so header shows the new name immediately
      auth.login(
        result,
        result.user,
        { ...result.project, name: localTasks.projectName }
      );
    }
    ```

    ALSO add a standalone project-name transfer block for the case where the user has NOT edited tasks
    (isDemoMode === true or tasks.length === 0) but HAS renamed the project. Add this after the
    existing if-block (not inside it):

    ```typescript
    // Transfer project name even if no tasks were edited
    const DEFAULT_NAME = 'Мой проект';
    if (localTasks.projectName && localTasks.projectName !== DEFAULT_NAME) {
      try {
        await fetch(`/api/projects/${result.project.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${result.accessToken}`,
          },
          body: JSON.stringify({ name: localTasks.projectName }),
        });
        auth.login(
          result,
          result.user,
          { ...result.project, name: localTasks.projectName }
        );
      } catch (err) {
        console.error('Failed to transfer project name after login:', err);
      }
    }
    ```

    To avoid duplication, refactor both cases into a single helper or combine the conditions:

    PREFERRED final structure — replace the entire existing if-block and add name transfer:

    ```typescript
    // 1. Import local tasks (if user edited them)
    const hasLocalEdits = !localTasks.isDemoMode && localTasks.tasks.length > 0;
    if (hasLocalEdits) {
      try {
        await fetch('/api/tasks', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${result.accessToken}`,
          },
          body: JSON.stringify(localTasks.tasks),
        });
        localStorage.removeItem('gantt_local_tasks');
        localStorage.removeItem('gantt_demo_mode');
      } catch (err) {
        console.error('Failed to import local tasks after login:', err);
      }
    }

    // 2. Transfer project name if guest renamed it (separate from task import)
    const DEFAULT_PROJECT_NAME = 'Мой проект';
    if (localTasks.projectName && localTasks.projectName !== DEFAULT_PROJECT_NAME) {
      try {
        await fetch(`/api/projects/${result.project.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${result.accessToken}`,
          },
          body: JSON.stringify({ name: localTasks.projectName }),
        });
        // Update auth state so header reflects the new name immediately
        auth.login(
          result,
          result.user,
          { ...result.project, name: localTasks.projectName }
        );
      } catch (err) {
        console.error('Failed to transfer project name after login:', err);
      }
    }
    ```

    Note: auth.login() is called at line 451 before the if-blocks. The second call inside the
    project-name block is intentional — it updates the project name in React state to the renamed value.
    auth.login() sets state so the header immediately shows the correct name without requiring a reload.
  </action>
  <verify>
    1. TypeScript compiles without errors: `cd D:/Projects/gantt-lib-mcp && npm run build -w packages/web 2>&1 | tail -5`
    2. Manual smoke test: open app as guest, rename project to "Мой тест", log in via OTP, verify header shows "Мой тест" not "Default Project"
  </verify>
  <done>
    After OTP login, auth.project.name in React state equals localTasks.projectName (if it was changed from default).
    The PATCH /api/projects/:id call appears in browser DevTools network tab on login when name differs from "Мой проект".
    TypeScript build passes.
  </done>
</task>

</tasks>

<verification>
- `npm run build -w packages/web` passes with no TypeScript errors
- The onSuccess block in App.tsx contains a PATCH /api/projects/ fetch call
- The call is only made when localTasks.projectName !== 'Мой проект'
</verification>

<success_criteria>
Guest renames local project, logs in via OTP, sees their custom project name in the header immediately.
Project name persists on page reload (server holds it).
</success_criteria>

<output>
After completion, create `.planning/quick/12-fix-project-name-not-transferred-when-gu/12-SUMMARY.md`
</output>
