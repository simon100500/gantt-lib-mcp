# Phase 13: Start Screen - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the current "No tasks yet." empty state (visible GanttChart + ChatSidebar) with a centered start screen shown when `tasks.length === 0`. The start screen contains: a headline, a wide multi-line prompt input, quick-access example chips below it, and a "Пустой график" button. Chat sidebar is hidden until the user takes an action.

</domain>

<decisions>
## Implementation Decisions

### Headline / branding
- Show only a text headline above the input: **«С чего начнём?»**
- Style: large (2xl–3xl), semi-bold — same weight/feel as Sonnet's welcome text
- No logo icon above it — just the text

### Prompt input on start screen
- Multi-line `textarea`, wide (stretches to fill the container width like Sonnet)
- Auto-grows from ~3 rows, same textarea logic as ChatSidebar
- Placeholder: «Опишите ваш проект или выберите пример ниже»
- Submit on Enter (Shift+Enter = new line), send button on the right

### "Пустой график" button
- Blue (primary color), appears **below** the textarea and chips row
- On click: create one placeholder task — name «Новая задача», startDate = today, endDate = today
- After click: add task to state, open chat sidebar (`setChatSidebarVisible(true)`), start screen disappears (tasks.length > 0)

### Example chips (below input)
- 4 chips showing project types: «Загородный дом», «Ремонт офиса», «ИТ-проект», «Мероприятие»
- On click: pre-fill the textarea with a descriptive prompt (NOT sent immediately — user can edit before sending)
- Prompt templates:
  - Загородный дом → «Создай график строительства загородного дома: фундамент, стены, кровля, отделка, ландшафт»
  - Ремонт офиса → «Создай график ремонта офиса: демонтаж, электрика, отделка стен, пол, мебель»
  - ИТ-проект → «Создай график разработки ИТ-проекта: аналитика, дизайн, разработка, тестирование, релиз»
  - Мероприятие → «Создай график подготовки мероприятия: площадка, кейтеринг, программа, продвижение, проведение»

### Toolbar visibility
- Gantt toolbar (Сегодня, Закрепить связи, Просроченные) is **hidden** on start screen
- Toolbar appears together with the Gantt chart when tasks.length > 0

### Transitions
- **After prompt submit from start screen**: switch immediately to full layout (chat sidebar visible + empty Gantt chart), first user message already in chat, AI thinking indicator shown
- **"Пустой график" click**: add task, open chat, start screen disappears
- **tasks.length returns to 0**: start screen reappears, chat state resets (chatSidebarVisible = false, messages cleared)

### Claude's Discretion
- Exact max-width of the start screen container (suggest ~640px centered)
- Spacing and padding between elements
- Background colour of start screen (white or bg-background)
- Transition animation (if any) between start screen and full layout

</decisions>

<specifics>
## Specific Ideas

- Reference: Claude Sonnet start screen — centered layout, large headline, wide input, suggestion chips below. «Только кнопка синяя» (primary color).
- The "Пустой график" button is visually distinct from the chips — it's a solid blue `<Button>` (shadcn), while chips are pill-shaped outlines like the existing QUICK_CHIPS in ChatSidebar.
- Chips on start screen are different from QUICK_CHIPS in chat — start screen chips = project type examples; chat chips = action commands.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Button` (shadcn/ui, `packages/web/src/components/ui/button.tsx`): use `variant="default"` (blue) for "Пустой график"
- `ChatSidebar.tsx` textarea + submit logic: replicate the same textarea auto-grow pattern for the start screen input
- `QUICK_CHIPS` pattern in `ChatSidebar.tsx`: reuse the pill-chip style (border-slate-200, hover:border-primary) for example chips on start screen
- `handleAddTask` in `App.tsx:150`: already exists — call it to add the placeholder task on "Пустой график" click
- `setChatSidebarVisible` in `App.tsx:83`: already exists — call `setChatSidebarVisible(true)` after action

### Established Patterns
- `chatSidebarVisible` state (`App.tsx:83`): controls chat visibility — start screen sets it to `false`; both actions (submit prompt, click "Пустой график") set it to `true`
- `tasks.length === 0` condition: already used in App.tsx (`{tasks.length > 0 && <footer>}`) — same pattern gates start screen vs normal layout
- Tailwind + cn() utility: established styling approach

### Integration Points
- `App.tsx`: condition `tasks.length === 0 && !loading` → render start screen instead of GanttChart + toolbar
- `handleSend` (App.tsx:124): call this with the prompt text when user submits from start screen — it sets first message and sends to WS
- When tasks deleted back to 0: the existing `useEffect` on `auth.project?.id` already clears tasks on project switch; start screen reappears naturally via `tasks.length === 0` condition

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-start-screen*
*Context gathered: 2026-03-09*
