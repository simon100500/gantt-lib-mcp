# Quick Task 030 Plan

## Goal

Fix the authenticated "Новый проект" flow so it first shows the empty start screen, and only creates a fresh project on the first prompt or `Пустой график` action.

## Tasks

1. Replace the authenticated `Новый проект` flow in `packages/web/src/App.tsx` with a deferred-creation flag that only resets the UI to the start screen.
2. On the first start-screen action, create and switch to a new project named `Проект YYYY-MM-DD`, then continue with the prompt or empty-chart flow.
3. Keep guest-mode behavior unchanged, cancel deferred creation when the user switches back to an existing project, and verify the web package still builds.
