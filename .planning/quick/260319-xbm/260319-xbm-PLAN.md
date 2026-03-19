---
phase: quick
plan: 260319-xbm
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/App.tsx
autonomous: true
requirements:
  - QUICK-XBM: Рекурсивно сворачивать всех родителей при нажатии "Свернуть все"

must_haves:
  truths:
    - "Пользователь нажимает 'Свернуть все' → сворачиваются все родительские задачи (включая вложенные)"
    - "Пользователь нажимает 'Развернуть все' → разворачиваются все задачи"
    - "При вложенных задачах (3+ уровня) сворачиваются все родители на всех уровнях"
  artifacts:
    - path: "packages/web/src/App.tsx"
      provides: "Рекурсивный handleCollapseAll"
      contains: "getAllParentIds.*recursive"
  key_links:
    - from: "App.tsx handleCollapseAll"
      to: "useProjectUIStore.setProjectState"
      via: "collapsedParentIds array"
      pattern: "setProjectState.*collapsedParentIds"
---

<objective>
Рекурсивное сворачивание всех родительских задач при нажатии "Свернуть все"

Purpose: Сейчас collapseAll сворачивает только root-родителей (parentId === null). Если у задачи есть подзадачи, которые тоже являются родителями, они не сворачиваются. Нужно сделать рекурсивный обход всех родителей.
Output: При нажатии "Свернуть все" сворачиваются ВСЕ родительские задачи на всех уровнях вложенности
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260319-vc2-ui-localstorage-viewmode-collapsedparent/260319-vc2-SUMMARY.md
@packages/web/src/App.tsx
@packages/web/src/stores/useProjectUIStore.ts

<interfaces>
<!-- Из App.tsx текущая реализация -->
```typescript
const handleCollapseAll = useCallback(() => {
  if (workspace.kind === 'project') {
    // Текущая реализация: только root-родители
    const allParentIds = tasks
      .filter(t => !t.parentId && tasks.some(c => c.parentId === t.id))
      .map(t => t.id);
    setProjectState(workspace.projectId, { collapsedParentIds: allParentIds });
  }
}, [tasks, workspace, setProjectState]);
```

<!-- Задача имеет интерфейс -->
```typescript
interface Task {
  id: string;
  parentId: string | null;
  name: string;
  // ... другие поля
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Реализовать рекурсивный поиск всех родительских задач</name>
  <files>packages/web/src/App.tsx</files>
  <action>
Заменить текущую логику в `handleCollapseAll` на рекурсивную:

1. Создать вспомогательную функцию `getAllParentIds` внутри `handleCollapseAll`:
   ```typescript
   // Рекурсивно находим все родительские задачи (не только root)
   const getAllParentIds = (tasks: Task[]): string[] => {
     const parentIds = new Set<string>();

     // Сначала собираем всех прямых родителей
     tasks.forEach(task => {
       if (task.parentId) {
         parentIds.add(task.parentId);
       }
     });

     // Возвращаем только те ID, которые существуют в tasks и являются родителями
     return Array.from(parentIds).filter(id =>
       tasks.some(t => t.id === id)
     );
   };
   ```

2. Заменить логику сворачивания:
   ```typescript
   const handleCollapseAll = useCallback(() => {
     console.log('[App] handleCollapseAll called', {
       workspaceKind: workspace.kind,
       tasksCount: tasks.length,
       projectId: workspace.kind === 'project' ? workspace.projectId : null
     });

     if (workspace.kind === 'project') {
       // Рекурсивно собираем ВСЕ родительские задачи (не только root)
       const allParentIds = getAllParentIds(tasks);

       console.log('[App] Found all parent IDs (recursive):', allParentIds);
       setProjectState(workspace.projectId, { collapsedParentIds: allParentIds });
     }
   }, [tasks, workspace, setProjectState]);
   ```

Логика: вместо фильтрации по `!t.parentId` ищем все задачи, на которые кто-то ссылается через `parentId`. Это автоматически включает родителей на всех уровнях вложенности.
  </action>
  <verify>
    <automated>cd packages/web && npm run build 2>&1 | grep -E "(error|Error|FAILED)" && exit 1 || echo "Build successful"</automated>
  </verify>
  <done>
    - `getAllParentIds` собирает всех родителей рекурсивно
    - При нажатии "Свернуть все" сворачиваются все родители на всех уровнях
    - Build проходит без ошибок
  </done>
</task>

</tasks>

<verification>
1. Создать тестовые данные с 3+ уровнями вложенности:
   - Задача A (root)
     - Подзадача A1 (родитель для A1.1)
       - Подзадача A1.1 (leaf)
     - Подзадача A2 (leaf)

2. Нажать "Свернуть все"
3. Убедиться:
   - Задача A свёрнута
   - Подзадача A1 тоже свёрнута (даже хотя она не root)
   - Подзадачи A1.1 и A2 не видны (их родители свёрнуты)

4. Нажать "Развернуть все"
5. Убедиться: все задачи снова видны
</verification>

<success_criteria>
- При нажатии "Свернуть все" сворачиваются ВСЕ родительские задачи
- Рекурсивный обход работает для любой глубины вложенности
- Build проходит без ошибок: `npm run build --workspace=packages/web`
</success_criteria>

<output>
After completion, create `.planning/quick/260319-xbm/260319-xbm-SUMMARY.md`
</output>
