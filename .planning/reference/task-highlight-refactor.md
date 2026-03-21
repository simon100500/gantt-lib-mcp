---
name: task-highlight-refactor
description: Refactor task highlighting to separate search highlights from temporary focus highlights
type: project
---

## Task Highlighting Refactoring

**Current State:**
- `searchResults: string[]` in useUIStore — IDs of tasks matching search query
- `tempHighlightedTaskId: string | null` in useUIStore — temporary highlight for new tasks (2 seconds)
- `highlightedSearchTaskIds` in ProjectWorkspace combines both into a Set
- GanttChart receives `highlightedTaskIds?: Set<string>` prop

**Problem:**
Two different concepts mixed together:
1. **Search highlights** — persistent while search is active, shows all matches
2. **Focus highlight** — temporary, single task, for drawing attention (e.g., newly created task)

**Proposed Solution:**

Option A: Add separate prop to gantt-lib
```typescript
// In gantt-lib GanttChart props
highlightedTaskIds?: Set<string>;  // search results (current)
focusedTaskId?: string;             // temporary focus (new)
```

Option B: Rename and clarify usage
```typescript
searchMatchTaskIds?: Set<string>;   // explicit: search matches
highlightedTaskIds?: Set<string>;   // general highlight (includes temp)
```

**Why:** Separation of concerns — search highlights are persistent/multiple, focus highlights are temporary/single.

**When to tackle:** When adding more highlight use cases or if the current combined approach becomes confusing.

**Files to change:**
- `packages/gantt-lib/src/GanttChart.tsx` — add new prop
- `packages/web/src/components/workspace/ProjectWorkspace.tsx` — pass separate props
- `packages/web/src/components/TaskSearch.tsx` — use focusedTaskId instead of tempHighlightedTaskId
- `packages/web/src/stores/useUIStore.ts` — rename tempHighlightedTaskId to focusedTaskId
