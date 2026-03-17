---
phase: quick
plan: 260317-ghn
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/App.tsx
  - packages/web/src/components/ChatSidebar.tsx
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "Application is usable on mobile devices (< 768px width)"
    - "Toolbar items don't overflow or wrap awkwardly on small screens"
    - "Chat sidebar is accessible but doesn't take full screen on mobile"
    - "Gantt chart remains scrollable on mobile devices"
    - "Buttons remain touch-friendly (minimum 44x44px) on mobile"
  artifacts:
    - path: "packages/web/src/App.tsx"
      provides: "Main layout with responsive breakpoints"
      responsive_classes:
        - "Header uses flex-wrap and responsive spacing"
        - "Toolbar uses responsive hiding of non-critical buttons"
        - "Sidebar uses responsive width (full on mobile, fixed on desktop)"
    - path: "packages/web/src/components/ChatSidebar.tsx"
      provides: "Chat component with responsive behavior"
      responsive_classes:
        - "Quick chips hide on small screens"
        - "Input area remains accessible on mobile"
  key_links:
    - from: "App.tsx header"
      to: "Mobile breakpoints"
      via: "Tailwind responsive classes (sm:, md:, lg:)"
      pattern: "flex-wrap|hidden.*md:|flex.*lg:"
    - from: "App.tsx toolbar"
      to: "Progressive disclosure"
      via: "Hide less critical buttons on small screens"
      pattern: "hidden sm:flex|md:hidden"
    - from: "ChatSidebar.tsx"
      to: "Mobile-optimized layout"
      via: "Responsive spacing and hiding chips"
      pattern: "hidden sm:flex|sm:px-"
---

<objective>
Implement basic responsive layout for taskbars and main interface, applying web design best practices for mobile-first, accessible, touch-friendly interfaces.

Purpose: Ensure the application is usable across different screen sizes (mobile, tablet, desktop) without breaking functionality or awkward wrapping.

Output: Responsive header, toolbar, and sidebar with proper breakpoints and touch-friendly targets.
</objective>

<execution_context>
@C:/Users/simon/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/simon/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/web/src/App.tsx
@packages/web/src/components/ChatSidebar.tsx
@packages/web/tailwind.config.js

## Current State
The application currently has NO responsive breakpoints. All elements use fixed layouts that may overflow or wrap poorly on mobile devices.

## Web Design Guidelines Applied
Based on frontend design best practices:
- **Mobile-first approach**: Start with mobile layout, enhance for larger screens
- **Touch targets**: Minimum 44x44px for buttons (Apple HIG), 48x48dp (Material Design)
- **Progressive disclosure**: Hide less critical elements on small screens
- **Flexible layouts**: Use flex-wrap and min-w-0 to prevent overflow
- **Readable text**: Minimum 16px base font size for mobile
- **Spacing**: Maintain adequate spacing for touch interaction

## Tailwind Breakpoints
- `sm:` 640px (small tablets, large phones)
- `md:` 768px (tablets)
- `lg:` 1024px (desktops)
- `xl:` 1280px (large desktops)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make header responsive with proper breakpoints</name>
  <files>packages/web/src/App.tsx</files>
  <action>
Update the header section (line ~689) to be responsive:

1. **Header container**: Add `flex-wrap` to allow wrapping on small screens
   - Change: `className="flex items-center gap-3 h-12 px-4 bg-white border-b border-slate-200 shrink-0"`
   - To: `className="flex items-center gap-2 sm:gap-3 h-12 px-3 sm:px-4 bg-white border-b border-slate-200 shrink-0 flex-wrap"`

2. **Logo section**: Keep visible on all screens but reduce spacing on mobile
   - Change: `className="flex items-center gap-2 text-base font-cascadia tracking-tight select-none"`
   - To: `className="flex items-center gap-1.5 sm:gap-2 text-base font-cascadia tracking-tight select-none"`

3. **Project name breadcrumb**: Allow truncation on mobile
   - Change: `className="text-sm font-medium text-slate-700 truncate"` (already has truncate)
   - Keep as-is, but ensure parent has `min-w-0` to allow truncation

4. **"+ Новый проект" button**: Hide on small screens, show on md+
   - Change: `className="h-7 shrink-0 px-2.5 text-xs text-primary hover:bg-primary/10 hover:text-primary"`
   - To: `className="h-7 shrink-0 px-2.5 text-xs text-primary hover:bg-primary/10 hover:text-primary hidden md:flex"`

5. **Account dropdown**: Reduce max-width on mobile
   - Change: `className="h-8 max-w-[280px] gap-1.5 px-2.5 text-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0"`
   - To: `className="h-8 max-w-[180px] sm:max-w-[280px] gap-1.5 px-2 sm:px-2.5 text-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0"`

6. **Login prompt text**: Hide on very small screens, show abbreviated on mobile
   - Find: `<span className="text-sm font-medium text-slate-600">Войдите, чтобы сохранить график</span>`
   - Change to: `<span className="text-xs sm:text-sm font-medium text-slate-600 hidden xs:inline">Войдите</span><span className="text-xs sm:text-sm font-medium text-slate-600 hidden sm:inline">, чтобы сохранить график</span>`

Do NOT change:
- Burger menu button (always needed)
- Logo icon (brand identity)
- Share link button (important functionality)
- Read-only badge (contextual info)
  </action>
  <verify>
Open browser DevTools, toggle device toolbar to mobile view (375px width):
- Header items should not overflow
- All buttons remain clickable
- "+ Новый проект" button is hidden
- Account dropdown truncates properly
- Login text shows "Войдите" on small screens
  </verify>
  <done>
Header is responsive on mobile (375px), tablet (768px), and desktop (1024px+)
- No horizontal overflow
- Touch targets remain >= 44px height
- Less critical elements hidden on mobile
  </done>
</task>

<task type="auto">
  <name>Task 2: Make Gantt toolbar responsive with progressive disclosure</name>
  <files>packages/web/src/App.tsx</files>
  <action>
Update the Gantt toolbar section (line ~844) to be responsive:

1. **Toolbar container**: Already has `flex-wrap`, ensure gap is responsive
   - Change: `className="flex items-center gap-1.5 h-11 px-4 bg-white border-b border-slate-200 shrink-0 flex-wrap"`
   - To: `className="flex items-center gap-1 sm:gap-1.5 h-11 px-3 sm:px-4 bg-white border-b border-slate-200 shrink-0 flex-wrap"`

2. **"Show/hide task list" button**: Keep text hidden on mobile, icon only
   - Change: `className="h-7 px-3 flex items-center gap-2 rounded border transition-colors ..."`
   - To: `className="h-7 px-2 sm:px-3 flex items-center gap-1.5 sm:gap-2 rounded border transition-colors ..."`
   - Change text: Add `hidden sm:inline` to the text span
   - Result: `<PanelLeft className="w-3.5 h-3.5" /><span className="hidden sm:inline">{showTaskList ? 'Скрыть задачи' : 'Показать задачи'}</span>`

3. **"Collapse/Expand all" buttons**: Hide on mobile, show on sm+
   - Find the two buttons with `ChevronsDownUp` and `ChevronsUpDown`
   - Add `hidden sm:flex` to both buttons
   - These are less critical on mobile where screen space is limited

4. **"Today" button**: Keep visible, reduce padding on mobile
   - Change: `className="h-7 text-xs gap-1.5 border-slate-200 text-slate-600 hover:text-slate-900"`
   - To: `className="h-7 px-2 sm:px-2.5 text-xs gap-1 sm:gap-1.5 border-slate-200 text-slate-600 hover:text-slate-900"`

5. **View mode split button**: Keep visible, ensure it doesn't break on mobile
   - The container already has `overflow-hidden` which is good
   - Reduce padding on mobile: Change all button `px-3` to `px-2 sm:px-3`
   - Keep text visible as it's essential functionality

6. **Feature switches**: (if any exist in the continuation) Hide on mobile, show on md+
   - Look for any SwitchControl components in the toolbar
   - Add `hidden md:flex` to wrapper if present

Do NOT change:
- Toolbar separator (always visible when items are visible)
- View mode buttons (critical for functionality)
- Today button (important navigation)
  </action>
  <verify>
Open browser DevTools, toggle device toolbar to mobile view (375px width):
- Toolbar items wrap if needed (flex-wrap)
- "Collapse/Expand all" buttons are hidden
- "Show/hide task list" shows icon only on mobile
- View mode buttons remain fully visible and clickable
- Today button remains accessible
- No horizontal overflow
  </verify>
  <done>
Gantt toolbar is responsive on mobile (375px), tablet (768px), and desktop (1024px+)
- Less critical controls hidden on mobile
- Essential controls remain accessible
- Buttons wrap gracefully if needed
- Touch targets remain >= 44px height
  </done>
</task>

<task type="auto">
  <name>Task 3: Make ChatSidebar responsive and mobile-optimized</name>
  <files>packages/web/src/components/ChatSidebar.tsx</files>
  <action>
Update the ChatSidebar component to be mobile-friendly:

1. **Quick chips section**: Hide on small screens to save vertical space
   - Find: `<div className="flex flex-wrap gap-1.5 px-3 pb-2">` (line ~197)
   - Change to: `<div className="hidden sm:flex flex-wrap gap-1.5 px-3 pb-2">`
   - Quick action chips are helpful but not essential on mobile

2. **Message input area**: Ensure full width and proper spacing on mobile
   - Find: `<form className="flex shrink-0 items-end gap-2 border-t border-slate-200 px-3 py-2.5">` (line ~215)
   - Change to: `<form className="flex shrink-0 items-end gap-2 border-t border-slate-200 px-3 py-2 sm:py-2.5">`
   - Slightly reduce padding on mobile

3. **Textarea**: Ensure proper sizing on mobile
   - Find: `className="flex-1 resize-none overflow-y-auto rounded-md px-3 py-2 text-sm leading-relaxed ..."`
   - Change to: `className="flex-1 resize-none overflow-y-auto rounded-md px-2.5 sm:px-3 py-2 text-sm leading-relaxed ..."`
   - Reduce horizontal padding slightly on mobile

4. **Send button**: Ensure touch-friendly size
   - Current: `className="... h-9 w-9 ..."` (line ~243)
   - Keep as-is - already meets minimum touch target size (36px)

5. **Empty state illustration**: Reduce padding on mobile
   - Find: `<div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">` (line ~133)
   - Change to: `<div className="flex flex-1 flex-col items-center justify-center gap-2 sm:gap-3 py-6 sm:py-8 text-center">`

6. **Header**: Already has good height (h-11 = 44px), keep as-is

Do NOT change:
- Connection status indicator (always visible)
- Close button (always needed)
- Message bubbles (already responsive with max-w-[86%])
- Loading state (already well-designed)
  </action>
  <verify>
Open browser DevTools, toggle device toolbar to mobile view (375px width):
- Quick chips are hidden
- Input area uses full available width
- Send button remains easily tappable (36x36px minimum)
- Messages display correctly with proper spacing
- No horizontal overflow
- Empty state uses less vertical space
  </verify>
  <done>
ChatSidebar is mobile-optimized:
- Quick action chips hidden on mobile
- Touch-friendly send button
- Proper spacing for mobile screens
- Messages remain readable
- No wasted vertical space on mobile
  </done>
</task>

</tasks>

<verification>
1. **Desktop (1280px+)**: All features visible, full functionality
2. **Tablet (768px)**: All buttons visible, slightly reduced spacing
3. **Mobile (375px)**: Less critical elements hidden, essential controls accessible
4. **No horizontal overflow** at any breakpoint
5. **Touch targets** remain >= 44px height on mobile
6. **No broken layouts** when resizing browser window
</verification>

<success_criteria>
- Application is fully functional on mobile devices (375px width)
- Toolbar uses progressive disclosure (hide less critical items on mobile)
- Header adapts to mobile with abbreviated text
- Chat sidebar is optimized for mobile with hidden quick chips
- No horizontal scrolling at any breakpoint
- All interactive elements remain touch-friendly (minimum 36x36px)
</success_criteria>

<output>
After completion, create `.planning/quick/260317-ghn-web-design-guidelines/260317-ghn-SUMMARY.md`
</output>
