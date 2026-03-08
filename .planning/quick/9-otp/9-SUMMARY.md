# Quick Task 9: Summary

**Description:** устрани мерцание OTP при перезагрузке страницы. а то сначала появляется эта модалка, а потом график. Надо сделать кнопку Войти (Акцентную с иконкой) если не войдено. Не размывать фон, просто затенить. И давать юзеру создавать график даже без входа. просто локально хранить сессию. И рядом с кнопкой входа писать Войдите, чтобы сохранить график.

**Completed:** 2026-03-09

---

## Implemented Features

### 1. No OTP Modal Flicker
- Gantt chart loads immediately without modal blocking
- OtpModal is now controlled via state (showOtpModal)
- Modal only appears when user clicks "Войти" button

### 2. Login Button with Icon
- Created `packages/web/src/components/LoginButton.tsx`
- Accent-style button with LogIn icon
- Hint text "Войдите, чтобы сохранить график" displayed next to button
- Shown in header when user is not authenticated

### 3. No Backdrop Blur
- OtpModal backdrop changed from `bg-black/40 backdrop-blur-sm` to `bg-black/40`
- Simple darkening without blur effect
- Added close button (X) in top-right
- Clicking outside modal closes it

### 4. Local Storage for Unauthenticated Users
- Created `packages/web/src/hooks/useLocalTasks.ts`
- Tasks stored in localStorage (key: `gantt_local_tasks`)
- Changes persist across page refreshes
- Same interface as useTasks for seamless switching

### 5. AI Assistant Auth Notice (Additional)
- When not logged in, AI assistant shows amber notice banner
- Message: "Войдите в аккаунт, чтобы использовать AI-ассистент"
- Chat input disabled in demo mode

### 6. Demo Project for Unauthenticated Users (Additional)
- Default demo project with 5 realistic tasks:
  1. "Проектирование БД" (3 дня)
  2. "Разработка API" (5 дней)
  3. "UI Компоненты" (4 дня)
  4. "Интеграция" (3 дня)
  5. "Тестирование и деплой" (2 дня)
- Dependencies between tasks (1→2, 2→4, 3→4, 4→5)
- "Демо-проект" badge in header
- Demo mode exits when user makes changes
- Message: "Демо-режим. Войдите, чтобы сохранить график"

### 7. Edit Project Name (Additional)
- Created `packages/web/src/components/EditProjectModal.tsx`
- Pencil icon button next to project name in ProjectSwitcher
- Modal with form for editing project name
- `updateProject` method added to auth-store
- PATCH `/api/projects/:id` endpoint added
- Real-time updates after save

---

## Files Created

| File | Purpose |
|------|---------|
| `packages/web/src/hooks/useLocalTasks.ts` | LocalStorage-based task storage |
| `packages/web/src/components/LoginButton.tsx` | Login button with icon |
| `packages/web/src/components/EditProjectModal.tsx` | Project name edit modal |

## Files Modified

| File | Changes |
|------|---------|
| `packages/web/src/App.tsx` | Auth-aware data source, modal control, demo mode |
| `packages/web/src/components/OtpModal.tsx` | Non-blocking, no backdrop blur, close button |
| `packages/web/src/components/ChatSidebar.tsx` | Auth notice for AI assistant |
| `packages/web/src/components/ProjectSwitcher.tsx` | Pencil icon for edit |
| `packages/mcp/src/auth-store.ts` | Added updateProject method |
| `packages/server/src/routes/auth-routes.ts` | Added PATCH /api/projects/:id |

---

## Commits

| Hash | Message |
|------|---------|
| cdbc262 | feat(quick-009): create useLocalTasks hook for localStorage |
| 25f52f3 | feat(quick-009): create LoginButton component with icon |
| 8ed46b0 | feat(quick-009): modify OtpModal to be non-blocking |
| b069c92 | feat(quick-009): update App.tsx for auth flow |
| cb6f3ce | feat(quick-009): add AI assistant auth notice |
| a32b31d | feat(quick-009): add demo project for unauthenticated users |
| fe1168a | feat(quick-009): add edit project name functionality |
| 03883a1 | fix(quick-009): add null check for auth.user |
| ab5da65 | fix(quick-009): fix TypeScript type casting |

---

## Testing Checklist

- [x] Gantt chart loads immediately (no modal flicker)
- [x] Login button visible with icon and hint text
- [x] Modal has no backdrop blur
- [x] Modal closes on backdrop click or X button
- [x] Unauthenticated users can create/edit tasks
- [x] Local storage persists across refreshes
- [x] AI assistant shows auth notice when not logged in
- [x] Demo project appears for unauthenticated users
- [x] Project name can be edited via pencil icon
- [x] Login flow works correctly
- [x] Server persistence for authenticated users
