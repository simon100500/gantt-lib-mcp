---
phase: quick
plan: 260320-fvq
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/components/layout/ProjectMenu.tsx
  - packages/web/src/stores/useUIStore.ts
  - packages/web/src/components/GanttChart.tsx
autonomous: false
requirements: []
user_setup: []
must_haves:
  truths:
    - "Пользователь может ввести текст поиска в input в хедере"
    - "При вводе показываются результаты поиска с количеством совпадений"
    - "Пользователь может перейти к следующему/предыдущему результату"
    - "Текущий результат подсвечивается визуально"
    - "Диаграмма прокручивается к найденной задаче"
    - "Поиск можно закрыть и сбросить"
  artifacts:
    - path: "packages/web/src/components/layout/ProjectMenu.tsx"
      provides: "Хедер с компонентом поиска"
      contains: "SearchInput, navigation buttons"
    - path: "packages/web/src/stores/useUIStore.ts"
      provides: "Состояние поиска (query, results, currentIndex)"
      exports: ["searchQuery, searchResults, searchIndex, setSearchQuery, navNext, navPrev"]
    - path: "packages/web/src/components/GanttChart.tsx"
      provides: "Ref метод для прокрутки к задаче"
      exports: ["scrollToTask"]
  key_links:
    - from: "ProjectMenu.tsx"
      to: "useUIStore"
      via: "useState/selector"
      pattern: "useUIStore.*search"
    - from: "ProjectMenu.tsx"
      to: "GanttChart.scrollToTask"
      via: "ref call on navigation"
      pattern: "ganttRef\\.current\\.scrollToTask"
---

<objective>
Добавить поиск по задачам в хедер с навигацией вперёд-назад, подсветкой и прокруткой к найденным задачам.

Purpose: Быстро находить задачи по названию в больших графиках
Output: Компонент поиска в хедере с навигацией между результатами
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/web/src/components/layout/ProjectMenu.tsx
@packages/web/src/stores/useTaskStore.ts
@packages/web/src/stores/useUIStore.ts
@packages/web/src/components/GanttChart.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Добавить состояние поиска в useUIStore</name>
  <files>packages/web/src/stores/useUIStore.ts</files>
  <action>
Добавить в useUIStore:
- searchQuery: string — текущий поисковый запрос
- searchResults: string[] — массив ID найденных задач
- searchIndex: number — индекс текущего результата (-1 если нет выбора)
- setSearchQuery: (query: string, tasks: Task[]) => void — фильтрует задачи по имени (case-insensitive, includes)
- navNext: () => void — переходит к следующему результату (циклично)
- navPrev: () => void — переходит к предыдущему результату (циклично)
- clearSearch: () => void — сбрасывает поиск

Логика поиска: фильтр tasks по t.name.toLowerCase().includes(query.toLowerCase())
  </action>
  <verify>
grep -n "searchQuery\|searchResults\|searchIndex\|setSearchQuery\|navNext\|navPrev" packages/web/src/stores/useUIStore.ts
  </verify>
  <done>
Состояние поиска добавлено в useUIStore с методами навигации
  </done>
</task>

<task type="auto">
  <name>Task 2: Создать компонент TaskSearch</name>
  <files>packages/web/src/components/TaskSearch.tsx</files>
  <action>
Создать новый компонент TaskSearch.tsx с:
- Input (из ui/input.tsx) для ввода поискового запроса
- Кнопки навигации (ChevronDown/ChevronUp из lucide-react) для вперёд/назад
- Счётчик результатов: "3/10" (текущий/всего)
- Кнопка закрытия (X из lucide-react)
- Иконка поиска (Search из lucide-react)

При нажатии на кнопки навигации:
- Вызывать navNext/navPrev из useUIStore
- Получать ID текущей задачи из searchResults[searchIndex]
- Вызывать проп onTaskNavigate(taskId) для прокрутки

Стиль: compact, placement в хедере рядом с проектом
  </action>
  <verify>
ls -la packages/web/src/components/TaskSearch.tsx
  </verify>
  <done>
Компонент TaskSearch создан с UI и логикой навигации
  </done>
</task>

<task type="auto">
  <name>Task 3: Интегрировать TaskSearch в ProjectMenu и подключить прокрутку</name>
  <files>packages/web/src/components/layout/ProjectMenu.tsx</files>
  <action>
В ProjectMenu.tsx:
1. Импортировать TaskSearch и получить ganttRef из props (добавить в ProjectMenuProps)
2. Добавить TaskSearch в header между названием проекта и правой частью
3. Передать в TaskSearch:
   - onTaskNavigate: (taskId) => ganttRef.current?.scrollToTask(taskId)
4. В App.tsx: передать ganttRef в ProjectMenu

Изменения в App.tsx:
- Добавить ganttRef в ProjectMenu props
- Убедиться что ganttRef передаётся корректно

Стиль размещения: между названием проекта и кнопкой "+ Новый проект"
  </action>
  <verify>
grep -n "TaskSearch" packages/web/src/components/layout/ProjectMenu.tsx
grep -n "ganttRef" packages/web/src/components/layout/ProjectMenu.tsx
  </verify>
  <done>
TaskSearch интегрирован в хедер, прокрутка к задачам работает
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Компонент поиска в хедере с навигацией и прокруткой</what-built>
  <how-to-verify>
1. Открой приложение
2. Введи текст в поиск (например, часть названия задачи)
3. Проверь что показывается счётчик результатов (например "3/10")
4. Нажми на кнопку вниз — диаграмма должна прокрутиться к следующей задаче
5. Нажми на кнопку вверх — прокрутка к предыдущей задаче
6. Закрой поиск — состояние сбрасывается
  </how-to-verify>
  <resume-signal>approved или опиши что исправить</resume-signal>
</task>

</tasks>

<verification>
- Компонент поиска виден в хедере
- Ввод текста фильтрует задачи
- Навигация работает циклично (с последнего на первое)
- Прокрутка к задаче работает через ganttRef.scrollToTask
- Счётчик результатов корректен
- Сброс поиска очищает состояние
</verification>

<success_criteria>
Поиск по задачам работает:
- Input для ввода текста в хедере
- Кнопки навигации вперёд/назад
- Счётчик результатов "текущий/всего"
- Прокрутка диаграммы к найденной задаче
- Закрытие поиска
</success_criteria>

<output>
After completion, create `.planning/quick/260320-fvq-search-in-header/260320-fvq-SUMMARY.md`
</output>
