# Zustand-рефакторинг frontend: план

## Контекст

App.tsx — god-компонент на ~1186 строк. Держит auth, задачи из 3 источников, WebSocket,
чат, 10+ UI-флагов и бизнес-логику переключения проектов. В `useBatchTaskUpdate` живёт
самодельный глобальный стейт на module-level listeners. React Query не нужен — WS-замена
задач конфликтует с его кешем.

## Что устанавливаем

```bash
npm install zustand -w packages/web
```

---

## Шаг 1 — Создать 4 стора

### `useAuthStore`
Заменяет `useAuth` hook целиком.

**Файл:** `src/stores/useAuthStore.ts`

```ts
interface AuthStore {
  user: AuthUser | null
  project: AuthProject | null
  projects: AuthProject[]
  accessToken: string | null
  isAuthenticated: boolean

  login(...)
  logout()
  switchProject(id: string)
  refreshAccessToken(): Promise<string | null>
  createProject(name: string): Promise<AuthProject | null>
  syncProjectTaskCount(id: string, count: number)
}
```

Весь localStorage-sync, token refresh, visibility listener переезжает сюда.
Компоненты вместо `const auth = useAuth()` делают `const { accessToken } = useAuthStore()`.

---

### `useTaskStore`
Заменяет тройную логику выбора источника задач.

**Файл:** `src/stores/useTaskStore.ts`

```ts
interface TaskStore {
  tasks: Task[]
  loading: boolean
  error: string | null
  source: 'server' | 'local' | 'shared'

  setTasks(tasks: Task[]): void
  replaceFromSystem(tasks: Task[]): void  // WS-замена (была replaceTasksFromSystem в App.tsx)
  fetchTasks(token: string): Promise<void> // из useTasks
  loadLocal(): void                        // из useLocalTasks
  loadShared(token: string): Promise<void> // из useSharedProject
}
```

Тройная условная логика из App.tsx:
```ts
// было:
const { tasks } = hasShareToken ? sharedProject : auth.isAuthenticated ? authenticatedTasks : localTasks
// станет: один useEffect в stores/useTaskStore.ts, реагирующий на auth + shareToken
```

---

### `useChatStore`
Весь стейт чата из App.tsx.

**Файл:** `src/stores/useChatStore.ts`

```ts
interface ChatStore {
  messages: ChatMessage[]
  streaming: string
  aiThinking: boolean

  addMessage(role: 'user' | 'assistant', content: string): void
  appendToken(token: string): void
  finishStreaming(): void
  setError(msg: string): void
  reset(): void
}
```

Убирает глобальный мутабельный `let msgCounter = 0` — заменяется на `crypto.randomUUID()`
внутри `addMessage`.

---

### `useUIStore`
Все UI-флаги из App.tsx.

**Файл:** `src/stores/useUIStore.ts`

```ts
interface UIStore {
  workspace: WorkspaceMode
  projectSidebarVisible: boolean
  showOtpModal: boolean
  showEditProjectModal: boolean
  viewMode: 'day' | 'week' | 'month'
  showTaskList: boolean
  autoSchedule: boolean
  highlightExpiredTasks: boolean
  validationErrors: DependencyError[]
  shareStatus: 'idle' | 'creating' | 'copied' | 'error'
  savingState: 'idle' | 'saving' | 'saved' | 'error'  // ← сюда переезжает globalSavingState

  setWorkspace(mode: WorkspaceMode): void
  openProjectChat(): void
  closeProjectChat(): void
  setSavingState(state: SavingState): void
  // ... остальные setters
}
```

---

## Шаг 2 — Выпилить globalSavingState из useBatchTaskUpdate

Сейчас в `useBatchTaskUpdate.ts`:
```ts
let globalSavingState: SavingState = 'idle';
const listeners = new Set<(state: SavingState) => void>();
function notifyListeners(state) { ... }
```

Это самодельный Zustand. Заменить на `useUIStore.getState().setSavingState(...)`.
Любой компонент получает `const savingState = useUIStore(s => s.savingState)` без
ручной подписки.

---

## Шаг 3 — Мигрировать useWebSocket

WS-хук остаётся хуком, но `handleWsMessage` пишет напрямую в сторы через `getState()`,
убирая проблему stale closure:

```ts
// было в App.tsx (зависело от setTasks в useCallback):
const handleWsMessage = useCallback((msg) => {
  if (msg.type === 'tasks') replaceTasksFromSystem(msg.tasks)
  if (msg.type === 'token') setStreaming(prev => prev + msg.content)
  ...
}, [setTasks])

// станет (всегда актуально, нет stale closure):
const handleWsMessage = (msg: ServerMessage) => {
  if (msg.type === 'tasks') useTaskStore.getState().replaceFromSystem(msg.tasks)
  if (msg.type === 'token') useChatStore.getState().appendToken(msg.content)
  if (msg.type === 'done')  useChatStore.getState().finishStreaming()
  if (msg.type === 'error') useChatStore.getState().setError(msg.message)
}
```

---

## Шаг 4 — Разбить App.tsx на компоненты

### Новая структура файлов

```
src/
  App.tsx                          ← только роутинг по workspace (~100 строк)
  stores/
    useAuthStore.ts
    useTaskStore.ts
    useChatStore.ts
    useUIStore.ts
  components/
    workspace/
      GuestWorkspace.tsx           ← StartScreen для неавторизованного
      SharedWorkspace.tsx          ← read-only режим расшаренного проекта
      ProjectWorkspace.tsx         ← основной режим: gantt + chat
      DraftWorkspace.tsx           ← режим создания нового проекта
    layout/
      Toolbar.tsx                  ← вся панель инструментов (viewMode, toggles, меню)
      ProjectMenu.tsx              ← dropdown: rename / share / delete проекта
    GanttChart.tsx                 ← уже есть
    ChatSidebar.tsx                ← уже есть
    OtpModal.tsx                   ← уже есть
    EditProjectModal.tsx           ← уже есть
    ProjectSwitcher.tsx            ← уже есть
```

### App.tsx после рефакторинга (~100 строк)

```tsx
export default function App() {
  const workspace = useUIStore(s => s.workspace)

  if (workspace.kind === 'shared') return <SharedWorkspace />
  if (workspace.kind === 'guest')  return <GuestWorkspace />
  if (workspace.kind === 'draft')  return <DraftWorkspace />
  return <ProjectWorkspace />
}
```

### ProjectWorkspace — только рендер, логика из сторов

```tsx
function ProjectWorkspace() {
  const tasks = useTaskStore(s => s.tasks)
  const chatOpen = useUIStore(s => s.workspace.kind === 'project' && s.workspace.chatOpen)
  const batchUpdate = useBatchTaskUpdate()

  return (
    <div className="flex flex-col h-screen">
      <Toolbar />
      <GanttChart tasks={tasks} onChange={batchUpdate.handleTasksChange} ... />
      {chatOpen && <ChatSidebar />}
    </div>
  )
}
```

### Toolbar — изолирован, читает только UIStore

```tsx
function Toolbar() {
  const { viewMode, setViewMode, autoSchedule, setAutoSchedule, showTaskList, setShowTaskList } = useUIStore()
  // Никаких задач, никакого auth — только UI-настройки
}
```

---

## Порядок выполнения

| # | Шаг | Зависимости | Риск |
|---|-----|-------------|------|
| 1 | Установить zustand | — | низкий |
| 2 | `useChatStore` | — | низкий |
| 3 | `useUIStore` + перенести `globalSavingState` | — | низкий |
| 4 | `useAuthStore` (заменяет `useAuth`) | — | средний |
| 5 | `useTaskStore` (тройная логика источников) | useAuthStore | высокий |
| 6 | Мигрировать `handleWsMessage` на `getState()` | useChatStore, useTaskStore | низкий |
| 7 | Разбить App.tsx на workspace-компоненты | все сторы | средний |

Каждый шаг деплоится независимо — старые хуки работают параллельно пока идёт миграция.

---

## Что НЕ трогаем

- `useWebSocket` — остаётся хуком, меняется только `handleWsMessage`
- `useBatchTaskUpdate` — остаётся хуком (сложная логика оптимистичных обновлений), только выпиливается `globalSavingState`
- `useTaskMutation` — чистый API-wrapper, трогать не нужно
- `useSharedProject`, `useTasks`, `useLocalTasks` — логика переезжает в `useTaskStore`, старые файлы удаляются

---

*Создан: 2026-03-18*
