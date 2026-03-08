---
phase: quick-009
plan: 9
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/App.tsx
  - packages/web/src/components/OtpModal.tsx
  - packages/web/src/hooks/useAuth.ts
  - packages/web/src/hooks/useTasks.ts
  - packages/web/src/components/LoginButton.tsx
autonomous: false
requirements: []
user_setup: []
must_haves:
  truths:
    - "User sees Gantt chart immediately on page load (no modal flicker)"
    - "Unauthenticated users can create and edit tasks locally"
    - "Login button is visible in header with 'Войдите, чтобы сохранить график' text"
    - "OtpModal only appears when user clicks the login button"
    - "Modal backdrop is darkened (bg-black/40) without blur effect"
    - "Local session persists across page refreshes"
    - "Authenticated users get server-side persistence"
  artifacts:
    - path: "packages/web/src/components/LoginButton.tsx"
      provides: "Login button component with icon and hint text"
      exports: ["LoginButton"]
    - path: "packages/web/src/hooks/useLocalTasks.ts"
      provides: "LocalStorage-based task storage for unauthenticated users"
      exports: ["useLocalTasks"]
    - path: "packages/web/src/components/OtpModal.tsx"
      provides: "Non-blocking OTP modal (triggered by button, not auto-render)"
      exports: ["OtpModal"]
    - path: "packages/web/src/App.tsx"
      provides: "Main app with auth-aware data source switching"
  key_links:
    - from: "packages/web/src/App.tsx"
      to: "packages/web/src/hooks/useLocalTasks.ts or useTasks.ts"
      via: "Conditional hook based on auth.isAuthenticated"
      pattern: "const taskHook = auth.isAuthenticated \\? useTasks : useLocalTasks"
    - from: "packages/web/src/App.tsx"
      to: "packages/web/src/components/LoginButton.tsx"
      via: "Import and render in header when !auth.isAuthenticated"
      pattern: "!auth.isAuthenticated && <LoginButton onClick={\\.\.\.} />"
    - from: "packages/web/src/components/OtpModal.tsx"
      to: "packages/web/src/App.tsx"
      via: "Controlled by state, not conditional rendering"
      pattern: "showOtpModal && <OtpModal onSuccess={\\.\.\.} onClose={\\.\.\.} />"
---

<objective>
Eliminate OTP modal flicker on page load and allow unauthenticated users to use Gantt chart with local storage.

Purpose: Users should see the Gantt chart immediately without auth blocking the UI. Authentication becomes an enhancement for cloud persistence, not a gate for basic functionality.

Output: Working Gantt chart with local storage for guests, non-blocking login button, clean modal without backdrop blur.
</objective>

<execution_context>
@D:/Projects/gantt-lib-mcp/.planning/quick/9-otp/9-PLAN.md
@D:/Projects/gantt-lib-mcp/.planning/STATE.md
</execution_context>

<context>
@packages/web/src/App.tsx
@packages/web/src/components/OtpModal.tsx
@packages/web/src/hooks/useAuth.ts
@packages/web/src/hooks/useTasks.ts
@packages/web/src/components/ui/button.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create useLocalTasks hook for localStorage-based task storage</name>
  <files>packages/web/src/hooks/useLocalTasks.ts</files>
  <action>
Create a new hook `useLocalTasks` that mirrors the useTasks interface but uses localStorage instead of API calls:

```typescript
interface UseLocalTasksResult {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  loading: boolean;  // Always false (local)
  error: string | null;  // Always null (local)
}
```

Key implementation details:
- localStorage key: `gantt_local_tasks`
- On mount: read from localStorage, parse JSON
- On setTasks: write to localStorage (useEffect with tasks dependency)
- loading: always false (no async)
- error: always null (no network)
- Include create/update/delete operations in setTasks handling

This hook provides the same interface as useTasks but works entirely client-side for unauthenticated users.
  </action>
  <verify>
    <automated>grep -n "export.*useLocalTasks" packages/web/src/hooks/useLocalTasks.ts && grep -n "localStorage" packages/web/src/hooks/useLocalTasks.ts</automated>
  </verify>
  <done>Hook file exists with localStorage integration, matches useTasks interface</done>
</task>

<task type="auto">
  <name>Task 2: Create LoginButton component with icon and hint text</name>
  <files>packages/web/src/components/LoginButton.tsx</files>
  <action>
Create a LoginButton component that:
- Renders an accent-style button (primary variant) with a login icon (LogIn from lucide-react)
- Shows text "Войти" on the button
- Displays hint text "Войдите, чтобы сохранить график" next to the button
- Has an onClick prop that triggers the OTP modal
- Uses appropriate styling to match the header design

Button should be placed in the header when user is not authenticated.

Reference existing button patterns from packages/web/src/components/ui/button.tsx and header styling from App.tsx.
  </action>
  <verify>
    <automated>grep -n "LogIn" packages/web/src/components/LoginButton.tsx && grep -n "Войдите, чтобы сохранить" packages/web/src/components/LoginButton.tsx</automated>
  </verify>
  <done>Component exists with login icon and hint text properly styled</done>
</task>

<task type="auto">
  <name>Task 3: Modify OtpModal to be non-blocking with controlled visibility</name>
  <files>packages/web/src/components/OtpModal.tsx</files>
  <action>
Update OtpModal component:
- Add `onClose` prop (callback when modal should close)
- Change backdrop from `bg-black/40 backdrop-blur-sm` to `bg-black/40` (remove blur)
- Make modal controlled externally (remove from auto-render in App.tsx)
- Add close button (X) in top-right corner
- Ensure clicking outside the modal calls onClose

The modal should now be:
- Only shown when explicitly triggered (via state in App.tsx)
- Closeable via close button or clicking backdrop
- No longer has the blur effect that causes visual jarring
  </action>
  <verify>
    <automated>grep -n "backdrop-blur" packages/web/src/components/OtpModal.tsx | grep -v "^#" || echo "No backdrop-blur found (correct)"</automated>
  </verify>
  <done>Modal has no backdrop-blur, has onClose callback, has close button</done>
</task>

<task type="auto">
  <name>Task 4: Update App.tsx for auth-aware data source and modal control</name>
  <files>packages/web/src/App.tsx</files>
  <action>
Modify App.tsx to implement the new auth flow:

1. Add state for modal visibility: `const [showOtpModal, setShowOtpModal] = useState(false);`

2. Conditional hook usage based on auth state:
```typescript
const authenticatedTasks = useTasks(auth.accessToken, auth.refreshAccessToken);
const localTasks = useLocalTasks();
const { tasks, setTasks, loading, error } = auth.isAuthenticated ? authenticatedTasks : localTasks;
```

3. Remove the auto-rendering modal from line 171: `{!auth.isAuthenticated && <OtpModal ... />}`

4. In header, replace the logout button section with:
```typescript
{!auth.isAuthenticated ? (
  <div className="flex items-center gap-3">
    <span className="text-xs text-slate-500">Войдите, чтобы сохранить график</span>
    <LoginButton onClick={() => setShowOtpModal(true)} />
  </div>
) : (
  <Button variant="ghost" size="sm" onClick={auth.logout} className="text-slate-500 hover:text-slate-900 text-xs h-7">
    Выйти
  </Button>
)}
```

5. Add controlled modal at the end of layout:
```typescript
{showOtpModal && (
  <OtpModal
    onSuccess={(result) => {
      auth.login(result, result.user, result.project);
      setShowOtpModal(false);
    }}
    onClose={() => setShowOtpModal(false)}
  />
)}
```

This ensures:
- Chart loads immediately with local storage
- No modal flicker on page load
- Login button visible with hint text
- Modal only appears when user clicks login
- Authenticated users get server persistence
  </action>
  <verify>
    <automated>grep -n "useLocalTasks" packages/web/src/App.tsx && grep -n "showOtpModal" packages/web/src/App.tsx && grep -n "Войдите, чтобы сохранить" packages/web/src/App.tsx</automated>
  </verify>
  <done>App uses local storage for unauthenticated users, shows login button, modal is controlled</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Complete auth flow refactor:
    - useLocalTasks hook for localStorage persistence
    - LoginButton component with icon and hint text
    - Non-blocking OtpModal without backdrop blur
    - App.tsx updated with auth-aware data source switching
  </what-built>
  <how-to-verify>
    1. Open the application in incognito/private mode (no existing session)
    2. Verify: Gantt chart loads immediately without any modal appearing
    3. Verify: Header shows "Войдите, чтобы сохранить график" text and a "Войти" button
    4. Verify: You can create/edit tasks without logging in (changes persist after refresh)
    5. Click the "Войти" button
    6. Verify: Modal appears with darkened backdrop (no blur)
    7. Verify: Modal has a close button (X) in top-right
    8. Verify: Clicking outside the modal closes it
    9. Enter email and complete OTP flow
    10. Verify: After login, your local tasks are still visible
    11. Verify: New tasks are saved to server (check in another browser or after logout/login)
    12. Refresh the page
    13. Verify: You remain logged in and see server-stored tasks
    14. Click "Выйти" button
    15. Verify: You return to local storage mode with previously stored local tasks
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
Overall verification steps:
1. No modal flicker on page load (chart appears immediately)
2. Unauthenticated users can create/edit tasks with localStorage persistence
3. Login button with icon and "Войдите, чтобы сохранить график" text visible
4. Modal has no backdrop blur, uses simple darkening
5. Modal only appears when clicking login button
6. Modal is closeable via close button or clicking backdrop
7. Authenticated users get server-side persistence
8. Local tasks survive page refresh
9. Login flow works correctly
</verification>

<success_criteria>
- Gantt chart visible immediately on page load (no blocking modal)
- Local storage works for unauthenticated users (create/edit/delete tasks)
- Login button displays with icon and hint text in header
- Modal backdrop is darkened without blur effect
- Modal is controlled by state (not auto-rendered)
- Authentication flow completes successfully
- Local tasks persist across page refreshes
- Server persistence works for authenticated users
</success_criteria>

<output>
After completion, create `.planning/quick/9-otp/9-SUMMARY.md`
</output>
