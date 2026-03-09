---
phase: 13-start-screen-no-tasks-yet-start-a-conversation-to-create-your-gantt-chart-sonnet
verified: 2026-03-10T10:00:00Z
status: human_needed
score: 5/5 must-haves verified (automated); 5 items require human visual/functional confirmation
re_verification: false
human_verification:
  - test: "Start screen is visible when no tasks exist"
    expected: "Full-area centered layout with headline «С чего начнём?», textarea, 4 chips (Загородный дом, Ремонт офиса, ИТ-проект, Мероприятие), blue «Пустой график» button. No Gantt chart, no toolbar, no chat sidebar visible."
    why_human: "Visual rendering and absence of elements requires browser inspection"
  - test: "Chip click pre-fills textarea without submitting"
    expected: "Clicking «ИТ-проект» fills textarea with «Создай график разработки ИТ-проекта: аналитика, дизайн, разработка, тестирование, релиз». Textarea is focused. No message sent, no chat opens."
    why_human: "DOM focus behavior and non-submission requirement needs runtime verification"
  - test: "Submitting from start screen opens chat sidebar with first message"
    expected: "Type text, press Enter. Chat sidebar appears on the right. User message is visible in chat. AI thinking indicator shows. Gantt area is visible (even with 0 tasks while AI processes)."
    why_human: "hasStartedChat flag behavior and chat-sidebar transition timing is runtime-only"
  - test: "«Пустой график» button creates a task and opens chat"
    expected: "One task named «Новая задача» with today's date appears in the Gantt chart. Chat sidebar opens. Start screen is gone."
    why_human: "Task creation, sidebar opening, and start screen disappearance are runtime state changes"
  - test: "Returning to 0 tasks after AI finishes shows start screen again"
    expected: "Delete all tasks (or switch project). After aiThinking becomes false and tasks.length returns to 0, the start screen reappears and chat sidebar is hidden."
    why_human: "Depends on aiThinking flag timing and delete-all interaction — runtime only"
---

# Phase 13: Start Screen Verification Report

**Phase Goal:** Replace empty state with a Sonnet-style centered start screen — headline, textarea, example chips, Пустой график button; chat sidebar hidden until user acts
**Verified:** 2026-03-10T10:00:00Z
**Status:** human_needed — all automated checks passed; 5 items require human browser verification
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When tasks.length === 0 and not loading and !hasStartedChat, only the start screen is rendered — no Gantt chart, no toolbar, no chat sidebar | VERIFIED (automated) | App.tsx line 357: `{tasks.length === 0 && !loading && !hasStartedChat ? (<StartScreen ...>) : (<>{gantt+chat}</>)}`. The else branch containing Gantt toolbar, GanttChart, and chat sidebar is only rendered when this condition is false. |
| 2 | User can type a prompt in the textarea and press Enter — chat sidebar opens and the first user message appears | VERIFIED (automated) | `handleStartScreenSend` (App.tsx lines 132-136): calls `setHasStartedChat(true)`, `setChatSidebarVisible(true)`, then `handleSend(text)`. `handleSend` adds user message to `messages` state and calls `send()`. The `!hasStartedChat` gate in the main conditional means layout switches immediately even while tasks.length is still 0. |
| 3 | Clicking a chip pre-fills the textarea with the corresponding Russian prompt text (not submitted automatically) | VERIFIED (automated) | StartScreen.tsx lines 63-66: `handleChipClick` sets `inputValue` (state only) and calls `textareaRef.current?.focus()`. No `onSend` call. All 4 chips present with correct Russian prompts (lines 14-30). |
| 4 | Clicking «Пустой график» adds one placeholder task, opens the chat sidebar, and the start screen disappears | VERIFIED (automated) | `handleEmptyChart` (App.tsx lines 162-172): creates Task `{id: task-${Date.now()}, name: 'Новая задача', startDate: today, endDate: today}`, calls `handleAddTask(placeholderTask)` and `setChatSidebarVisible(true)`. Task addition increments tasks.length to 1, flipping the main conditional. Note: `hasStartedChat` is NOT set to true here — but tasks.length > 0 already exits the start screen condition. |
| 5 | If tasks return to 0 (and AI is not thinking), the start screen reappears and chat sidebar is hidden | VERIFIED (automated) | useEffect (App.tsx lines 261-267): `if (tasks.length === 0 && !loading && !aiThinking) { setHasStartedChat(false); setChatSidebarVisible(false); }` resets both flags. Project switch also resets `hasStartedChat` (App.tsx lines 253-259). |

**Score:** 5/5 truths verified (automated logic)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/web/src/components/StartScreen.tsx` | Centered start screen component with headline, textarea, chips, Пустой график button; exports StartScreen and StartScreenProps | VERIFIED | 146 lines, substantive. Exports `StartScreenProps` interface (line 6) and `StartScreen` function (line 32). Contains headline (line 72), textarea (line 79), 4 CHIPS (lines 13-30), chip render loop (lines 114-129), Button «Пустой график» (lines 133-142). |
| `packages/web/src/App.tsx` | Conditional rendering: tasks.length === 0 && !loading && !hasStartedChat -> StartScreen; otherwise full layout | VERIFIED | Imports StartScreen (line 5). Conditional at line 357. `chatSidebarVisible` initial state is `false` (line 84). `hasStartedChat` state (line 85). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `StartScreen.tsx` | `App.tsx` | `onSend` prop → `handleStartScreenSend` | WIRED | App.tsx line 360: `onSend={handleStartScreenSend}`. `handleStartScreenSend` (lines 132-136) sets `hasStartedChat(true)`, `setChatSidebarVisible(true)`, calls `handleSend(text)`. |
| `StartScreen.tsx` | `App.tsx` | `onEmptyChart` prop → `handleEmptyChart` | WIRED | App.tsx line 361: `onEmptyChart={handleEmptyChart}`. `handleEmptyChart` (lines 162-172) creates Task, calls `handleAddTask`, `setChatSidebarVisible(true)`. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| START-01 | 13-01-PLAN.md | Start screen shown when tasks.length === 0 | SATISFIED | App.tsx line 357: conditional renders StartScreen when `tasks.length === 0 && !loading && !hasStartedChat` |
| START-02 | 13-01-PLAN.md | Textarea with headline, chips, Пустой график button | SATISFIED | StartScreen.tsx: headline line 72, textarea line 79, CHIPS array lines 13-30, Button line 134 |
| START-03 | 13-01-PLAN.md | Chip click pre-fills textarea without submitting | SATISFIED | `handleChipClick` (lines 63-66): sets `inputValue` state only, no `onSend` call |
| START-04 | 13-01-PLAN.md | Submit opens chat sidebar with first user message | SATISFIED | `handleStartScreenSend` (lines 132-136): sets chat visible, adds user message via `handleSend` |
| START-05 | 13-01-PLAN.md | Tasks returning to 0 resets to start screen | SATISFIED | useEffect (lines 261-267) resets `hasStartedChat` and `chatSidebarVisible` to false when `tasks.length === 0 && !loading && !aiThinking` |

**IMPORTANT — Orphaned Requirements Note:**

START-01 through START-05 are referenced in both 13-01-PLAN.md and ROADMAP.md line 280, but **these IDs do not appear anywhere in .planning/REQUIREMENTS.md**. The Traceability table in REQUIREMENTS.md only maps up to Phase 8 requirements and does not include any START-* entries. The REQUIREMENTS.md file has not been updated to include phase 13 requirements.

This is a documentation gap only — the implementation satisfies the intent of all five requirement IDs as described in the PLAN. No code changes needed; REQUIREMENTS.md should be updated to formally register START-01 through START-05 and add them to the Traceability table for Phase 13.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No anti-patterns detected in either StartScreen.tsx or App.tsx (modified sections). No TODO/FIXME/placeholder comments, no empty returns, no stub implementations, no console-log-only handlers.

---

### Documented Deviation from Plan

The PLAN's must_haves truth #1 stated the condition as `tasks.length === 0 && !loading`. The actual implementation uses `tasks.length === 0 && !loading && !hasStartedChat`. This deviation is intentional, documented in the SUMMARY as a bug fix (commit 500a8b2), and **improves** correctness: without `hasStartedChat`, the layout would revert to StartScreen immediately after submit (while AI processes and tasks are still 0), breaking the UX. The fix was caught during human verification (Task 3) and correctly applied.

---

### Human Verification Required

#### 1. Start screen visual appearance

**Test:** Run `npm run dev` in `D:/Projects/gantt-lib-mcp`, open http://localhost:5173 in guest mode with no tasks.
**Expected:** Full-area centered layout shows headline «С чего начнём?», auto-growing textarea with placeholder «Опишите ваш проект или выберите пример ниже», 4 pill chips (Загородный дом, Ремонт офиса, ИТ-проект, Мероприятие), blue «Пустой График» button. No Gantt chart, no toolbar, no chat sidebar visible.
**Why human:** Visual rendering, layout centering, and absence of other UI elements require browser inspection.

#### 2. Chip pre-fill behavior (no auto-submit)

**Test:** Click chip «ИТ-проект».
**Expected:** Textarea is filled with «Создай график разработки ИТ-проекта: аналитика, дизайн, разработка, тестирование, релиз». Textarea is focused. Chat sidebar does NOT open. No message is sent.
**Why human:** Focus behavior and non-submission requirement can only be confirmed at runtime.

#### 3. Prompt submit opens chat with first message and correct layout

**Test:** Type any text (or use chip text) in the textarea and press Enter (not Shift+Enter).
**Expected:** Chat sidebar appears immediately on the right. User message is visible in the chat. AI thinking indicator (spinner or "думаю...") is shown. The Gantt area is visible (even though tasks.length is still 0 while AI processes). Start screen is gone.
**Why human:** `hasStartedChat` flag's effect on layout transition timing requires runtime observation. Also confirms Shift+Enter inserts newline rather than submitting.

#### 4. «Пустой график» creates task and opens chat

**Test:** From the start screen, click the blue «Пустой график» button.
**Expected:** One task named «Новая задача» appears in the Gantt chart with today's date for both start and end. Chat sidebar opens on the right. Start screen is gone.
**Why human:** Task creation in Gantt, sidebar opening, and start screen disappearance are runtime state changes.

#### 5. Tasks returning to 0 restores start screen

**Test:** Delete the «Новая задача» task from the Gantt chart (using the delete icon or context menu). Wait for any AI response to complete (aiThinking = false).
**Expected:** Start screen reappears. Chat sidebar is hidden.
**Why human:** Depends on aiThinking flag timing and delete interaction — runtime only. Also validates project switch resets the screen correctly.

---

### Gaps Summary

No gaps found in the implementation. All automated verification checks passed:

- StartScreen.tsx is substantive (146 lines, full implementation, no stubs)
- All 4 chips with correct Russian prompts are present
- Both key prop links (onSend, onEmptyChart) are correctly wired in App.tsx
- chatSidebarVisible starts as false (line 84)
- hasStartedChat flag correctly gates the layout transition
- TypeScript compiles without errors
- All 3 phase commits exist in git log (d3ced5a, 5775386, 500a8b2)

The only open item is the **documentation gap**: START-01 through START-05 are not registered in REQUIREMENTS.md. This does not affect the running application.

Five human verification items remain for visual and runtime behavior confirmation.

---

_Verified: 2026-03-10T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
