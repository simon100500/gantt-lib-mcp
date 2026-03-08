---
phase: quick
plan: 008
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/App.tsx
  - packages/web/src/components/ChatSidebar.tsx
  - packages/web/src/components/ProjectSwitcher.tsx
  - packages/web/src/components/OtpModal.tsx
autonomous: true
requirements: []
user_setup: []

must_haves:
  truths:
    - "Все элементы интерфейса переведены на русский язык"
    - "Панель агента можно скрыть через кнопку"
    - "Кнопка показа скрытой панели акцентная с подписью"
    - "Кнопка показа имеет подпись 'Показать задачи'"
  artifacts:
    - path: "packages/web/src/App.tsx"
      provides: "Основной компонент приложения с состоянием видимости панели агента"
      contains: "useState для chatSidebarVisible, кнопка показа/скрытия панели"
    - path: "packages/web/src/components/ChatSidebar.tsx"
      provides: "Компонент боковой панели чата"
      exports: ["ChatSidebar"]
    - path: "packages/web/src/components/ProjectSwitcher.tsx"
      provides: "Переключатель проектов"
      exports: ["ProjectSwitcher"]
    - path: "packages/web/src/components/OtpModal.tsx"
      provides: "Модальное окно OTP-авторизации"
      exports: ["OtpModal"]
  key_links:
    - from: "packages/web/src/App.tsx"
      to: "src/components/ChatSidebar.tsx"
      via: "условный рендеринг на основе chatSidebarVisible"
      pattern: "chatSidebarVisible.*ChatSidebar"
---

<objective>
Перевести интерфейс на русский язык, добавить кнопку скрытия панели агента с акцентной кнопкой показа и подписью "Показать задачи".

Purpose: Улучшение UX для русскоязычных пользователей и добавление возможности скрывать панель агента для увеличения рабочей области.
Output: Русифицированный интерфейс с управляемой панелью агента
</objective>

<execution_context>
@D:/Projects/gantt-lib-mcp/.claude/get-shit-done/workflows/execute-plan.md
@D:/Projects/gantt-lib-mcp/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@D:/Projects/gantt-lib-mcp/packages/web/src/App.tsx
@D:/Projects/gantt-lib-mcp/packages/web/src/components/ChatSidebar.tsx
@D:/Projects/gantt-lib-mcp/packages/web/src/components/ProjectSwitcher.tsx
@D:/Projects/gantt-lib-mcp/packages/web/src/components/OtpModal.tsx

# Current UI structure:
- App.tsx: Main layout with header, Gantt chart, ChatSidebar in aside
- ChatSidebar.tsx: AI assistant panel with messages and input
- ProjectSwitcher.tsx: Dropdown for project selection
- OtpModal.tsx: OTP authentication modal
</context>

<tasks>

<task type="auto">
  <name>Task 1: Перевести интерфейс на русский язык</name>
  <files>packages/web/src/App.tsx, packages/web/src/components/ChatSidebar.tsx, packages/web/src/components/ProjectSwitcher.tsx, packages/web/src/components/OtpModal.tsx</files>
  <action>
    Заменить английский текст на русский во всех компонентах:

    **App.tsx:**
    - "GanttAI" → "GanttAI" (оставить без изменений)
    - "Logout" → "Выйти"
    - "Auto-Schedule" → "Авто-планирование"
    - "Highlight Expired" → "Просроченные"
    - "Lock Names" → "Блок. названия"
    - "Lock Deps" → "Блок. связи"
    - "Today" → "Сегодня"
    - "Clear" → "Очистить"
    - "Connected" → "Подключено"
    - "Reconnecting…" → "Переподключение…"
    - "{n} task{s}" → "{n} задач{а/и/}"
    - "Loading…" → "Загрузка…"

    **ChatSidebar.tsx:**
    - "AI Assistant" → "AI Ассистент"
    - "AI Gantt Assistant" → "AI Гант-ассистент"
    - "Ask me to create or edit your project schedule" → "Попросите создать или изменить расписание проекта"
    - QUICK_CHIPS: ['Add a task', 'Shift deadlines', 'Link dependencies', 'Show summary'] → ['Добавить задачу', 'Сдать сроки', 'Связать задачи', 'Показать сводку']
    - "Message AI…" → "Сообщение AI…"
    - "AI is thinking…" → "AI думает…"

    **ProjectSwitcher.tsx:**
    - "New project" → "Новый проект"
    - "New project name:" → "Название нового проекта:"
    - "Failed to create project. Please try again." → "Не удалось создать проект. Попробуйте снова."

    **OtpModal.tsx:**
    - "Sign in to Gantt" → "Вход в Gantt"
    - "Enter your email to receive a one-time code" → "Введите email для получения кода"
    - "Email address" → "Email адрес"
    - "Send code" → "Отправить код"
    - "Sending..." → "Отправка..."
    - "Change email" → "Изменить email"
    - "Check your email" → "Проверьте email"
    - "We sent a 6-digit code to {email}" → "Мы отправили 6-значный код на {email}"
    - "Didn't get it?" → "Не получили?"
    - "Resend" → "Отправить снова"
    - Error messages:
      - "Email required" → "Требуется email"
      - "Invalid email address" → "Неверный email адрес"
      - "Please enter all 6 digits" → "Введите все 6 цифр"
  </action>
  <verify>
    <automated>grep -r "AI Assistant\|Auto-Schedule\|Logout\|New project\|Sign in" packages/web/src/ --include="*.tsx" --include="*.ts" | grep -v "// " || echo "No untranslated strings found"</automated>
  </verify>
  <done>Все текстовые элементы интерфейса отображаются на русском языке</done>
</task>

<task type="auto">
  <name>Task 2: Добавить кнопку скрытия панели агента с акцентной кнопкой показа</name>
  <files>packages/web/src/App.tsx</files>
  <action>
    В App.tsx добавить:
    1. Новое состояние: `const [chatSidebarVisible, setChatSidebarVisible] = useState(true);`
    2. В заголовке ChatSidebar (строка 52 в ChatSidebar.tsx) добавить кнопку закрытия:
       - Импортировать иконку: `import { X } from 'lucide-react';` в ChatSidebar.tsx
       - Добавить проп `onClose` в интерфейс ChatSidebarProps
       - Добавить кнопку закрытия в header: `<button onClick={onClose} className="ml-auto p-1 hover:bg-slate-100 rounded"><X className="w-4 h-4 text-slate-500" /></button>`
    3. Когда панель скрыта (chatSidebarVisible = false), показывать акцентную кнопку внизу слева:
       ```tsx
       {!chatSidebarVisible && (
         <button
           onClick={() => setChatSidebarVisible(true)}
           className="fixed bottom-8 left-4 z-40 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg shadow-lg hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-medium"
         >
           <Sparkles className="w-4 h-4" />
           Показать задачи
         </button>
       )}
       ```
    4. Передавать проп `onClose={() => setChatSidebarVisible(false)}` в ChatSidebar
    5. Условно рендерить ChatSidebar: `{chatSidebarVisible && <aside className="...">...</aside>}`
  </action>
  <verify>
    <automated>grep -n "chatSidebarVisible\|setChatSidebarVisible\|onClose" packages/web/src/App.tsx packages/web/src/components/ChatSidebar.tsx</automated>
  </verify>
  <done>Панель агента скрывается через кнопку X, показывается акцентная кнопка 'Показать задачи' внизу слева экрана</done>
</task>

</tasks>

<verification>
1. Запустить `npm run dev` в packages/web
2. Проверить что все тексты на русском языке
3. Нажать кнопку закрытия на панели агента - панель должна скрыться
4. Убедиться что появилась кнопка "Показать задачи" внизу слева экрана
5. Нажать кнопку "Показать задачи" - панель должна появиться снова
</verification>

<success_criteria>
- Весь UI переведен на русский язык без остатков английского текста
- Панель агента имеет кнопку закрытия (X)
- При скрытии панели появляется акцентная кнопка с иконкой Sparkles и текстом "Показать задачи"
- Кнопка показа расположена фиксированно внизу слева (fixed bottom-8 left-4)
- Кнопка показа имеет стиль: bg-primary, shadow-lg, rounded-lg
</success_criteria>

<output>
After completion, create `.planning/quick/008-russian-ui-agent-panel/008-SUMMARY.md`
</output>
