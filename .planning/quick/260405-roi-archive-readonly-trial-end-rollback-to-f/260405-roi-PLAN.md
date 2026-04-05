---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/server/src/services/trial-service.ts
  - packages/web/src/components/ProjectSwitcher.tsx
autonomous: true
must_haves:
  truths:
    - "End Trial Now в админке автоматически откатывает на free и архивирует лишние проекты"
    - "Архивированные проекты отображаются с иконкой замка в списке проектов"
  artifacts:
    - path: "packages/server/src/services/trial-service.ts"
      provides: "endTrialNow with auto-rollback and project archiving"
    - path: "packages/web/src/components/ProjectSwitcher.tsx"
      provides: "Lock icon on archived project rows"
  key_links:
    - from: "packages/server/src/routes/admin-routes.ts"
      to: "packages/server/src/services/trial-service.ts"
      via: "trialService.endTrialNow"
      pattern: "endTrialNow"
    - from: "packages/web/src/components/ProjectSwitcher.tsx"
      to: "lucide-react"
      via: "Lock icon import"
      pattern: "Lock"
---

<objective>
Исправить два связанных бага:

1. **Trial end -> auto-rollback**: При нажатии "Завершить сейчас" в админке (endTrialNow) нужно автоматически вызывать rollback на free план и архивировать все лишние проекты сверх FREE_PROJECT_LIMIT. Сейчас endTrialNow просто ставит billingState='trial_expired', но не трогает проекты — пользователь остаётся с 3 проектами на free-лимите (1).

2. **Lock icon for archived**: Архивированные проекты в ProjectSwitcher нужно пометить иконкой замка (Lock из lucide-react), чтобы визуально было понятно что проект readonly.

Purpose: Корректное завершение триала с enforcement бесплатного лимита и ясная визуализация readonly-статуса.
Output: endTrialNow с авто-архивацией, Lock icon на archived проектах.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>

## Problem Analysis

### Bug 1: endTrialNow does not archive excess projects

Текущий флоу в админке:
- Admin clicks "Завершить сейчас" -> `POST /api/admin/users/:id/trial/end` -> `trialService.endTrialNow()`
- `endTrialNow()` ONLY sets `billingState: 'trial_expired'` and `trialEndedAt: now`
- Does NOT call `rollbackTrialToFree()`, does NOT archive any projects
- User stays with 3 projects but free plan limit is 1

Решение: `endTrialNow()` должен после установки `trial_expired` автоматически:
1. Поменять plan на 'free', billingState на 'free'
2. Посчитать активные проекты сверх FREE_PROJECT_LIMIT (1)
3. Архивировать излишки (самые старые проекты) — `project.update({ status: 'archived', archivedAt: now })`
4. Записать billingEvent с metadata о количестве архивированных проектов

### Bug 2: No visual indicator for archived/readonly projects

В ProjectSwitcher `isArchived = project.status === 'archived'` используется только для секции "Архив" и контекстного меню. Нет визуального индикатора readonly.

Решение: Добавить иконку Lock (lucide-react) рядом с именем архивированного проекта в ProjectRow.

## Key Interfaces

From packages/server/src/services/trial-service.ts:
```typescript
const FREE_PROJECT_LIMIT = 1;

export class TrialService {
  async endTrialNow(userId: string, opts?: TrialActionOptions): Promise<{ billingState: BillingState }>
  async rollbackTrialToFree(userId: string, opts?: TrialActionOptions): Promise<RollbackResult>
}
```

From packages/web/src/components/ProjectSwitcher.tsx:
```typescript
interface ProjectRowProps {
  project: AuthProject;  // has .status field, 'archived' means readonly
  isCurrent: boolean;
  // ...
}
// Uses lucide-react icons: Archive, ChevronDown, Folder, Layers, MoreHorizontal, PanelRightOpen, Plus, RotateCcw, Trash2
```

</context>

<tasks>

<task type="auto">
  <name>Task 1: endTrialNow auto-rollback + archive excess projects</name>
  <files>packages/server/src/services/trial-service.ts</files>
  <action>
Переписать `endTrialNow()` чтобы после установки `trial_expired` он автоматически делал rollback на free план и архивировал лишние проекты.

具体な изменения в `endTrialNow()`:

1. После обновления billingState на `trial_expired`, продолжить в той же функции:
   - Обновить subscription: `plan: 'free'`, `billingState: 'free'`, `rolledBackAt: now`, `periodStart: null`, `periodEnd: null`
   - Посчитать `activeProjects` через `prisma.project.count({ where: { userId, status: 'active' } })`
   - Если `activeProjects > FREE_PROJECT_LIMIT`: найти самые старые проекты сверх лимита:
     ```ts
     const excessProjects = await prisma.project.findMany({
       where: { userId, status: 'active' },
       orderBy: { createdAt: 'asc' },  // самые старые первыми
       skip: FREE_PROJECT_LIMIT,        // пропускаем разрешённые
     });
     ```
   - Архивировать каждый excess-проект:
     ```ts
     await prisma.project.updateMany({
       where: { id: { in: excessProjects.map(p => p.id) } },
       data: { status: 'archived', archivedAt: now },
     });
     ```
   - Записать billingEvent с metadata: `{ autoRolledBack: true, archivedProjects: excessProjects.length, previousState, newState: 'free' }`

2. Обновить возвращаемый тип — вернуть `{ billingState: 'free', overLimitProjects: number, archivedProjectIds: string[] }`

3. Обновить admin route handler для `/api/admin/users/:id/trial/end` — он уже возвращает `buildAdminUserDetails(userId)` после вызова, так что фронтенд получит свежие данные.

4. Добавить/обновить тесты в `packages/server/src/services/trial-service.test.ts`:
   - Test: endTrialNow sets billingState to 'free' (not 'trial_expired')
   - Test: endTrialNow archives excess projects beyond FREE_PROJECT_LIMIT
   - Test: endTrialNow keeps first N projects active (where N = FREE_PROJECT_LIMIT)
   - Test: endTrialNow records billing event with archivedProjects metadata

ВАЖНО: Не удалять rollbackTrialToFree() — он может использоваться отдельно. Но его внутреннюю логику (подсчёт overLimit, обновление subscription) можно переиспользовать, вызвав из endTrialNow.

Простейший подход: endTrialNow вызывает rollbackTrialToFree + дополнительно архивирует проекты (rollbackTrialToFree сейчас НЕ архивирует — он только считает overLimitProjects). Значит нужно добавить архивацию прямо в endTrialNow после вызова rollbackTrialToFree, ИЛИ добавить архивацию в rollbackTrialToFree тоже.

Лучший вариант: добавить архивацию проектов в `rollbackTrialToFree()`, потому что rollback без реальной архивации бессмысленен — и автоматический вызов из checkAndRollExpiredTrials, и ручной rollback из админки должны архивировать. Тогда endTrialNow просто вызовет rollbackTrialToFree после установки trial_expired.
  </action>
  <verify>
    <automated>cd D:/Projects/gantt-lib-mcp/packages/server && npx vitest run src/services/trial-service.test.ts</automated>
  </verify>
  <done>
    - endTrialNow автоматически откатывает на free план
    - Излишки проектов (сверх FREE_PROJECT_LIMIT=1) архивируются (status='archived', archivedAt=now)
    - Тесты покрывают: переход на free, архивацию excess, сохранение разрешённых проектов
    - rollbackTrialToFree тоже архивирует излишки проектов
  </done>
</task>

<task type="auto">
  <name>Task 2: Lock icon on archived projects in ProjectSwitcher</name>
  <files>packages/web/src/components/ProjectSwitcher.tsx</files>
  <action>
Добавить иконку замка (Lock) из lucide-react для архивированных проектов в ProjectRow.

1. Добавить `Lock` в import из lucide-react (строка 2).

2. В компоненте `ProjectRow`, внутри кнопки (элемент `<button>` с `onClick={() => onSwitch(project.id)}`), после `<span className="truncate text-xs">{project.name}</span>`, добавить иконку замка для архивированных проектов:

```tsx
{isArchived && (
  <Lock className="h-3 w-3 shrink-0 text-slate-400" aria-label="Только чтение" title="Проект в архиве (только чтение)" />
)}
```

Разместить lock icon внутри span с taskCount — справа от названия проекта, слева от счётчика задач. Для archived проектов в секции "Архив" замок будет всегда виден, не только при hover.

3. Добавить opacity/saturation визуальный дифф для архивированных проектов — небольшой `opacity-60` на имя проекта если isArchived, чтобы текст был чуть приглушён.

4. Убедиться что замок не добавляется для active проектов (только `isArchived`).
  </action>
  <verify>
    <automated>cd D:/Projects/gantt-lib-mcp/packages/web && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - Lock icon отображается рядом с именем каждого архивированного проекта в ProjectSwitcher
    - Имя проекта в архиве слегка приглушено (opacity-60)
    - Иконка не появляется у активных проектов
    - TypeScript компилируется без ошибок
  </done>
</task>

</tasks>

<verification>
1. `cd packages/server && npx vitest run src/services/trial-service.test.ts` — все тесты проходят
2. `cd packages/web && npx tsc --noEmit` — нет ошибок компиляции
3. В админке: Start trial -> End Now -> пользователь откатывается на free, excess проекты в архиве
4. В ProjectSwitcher: archived проекты показывают Lock icon
</verification>

<success_criteria>
- endTrialNow автоматически откатывает на free и архивирует excess проекты
- Lock icon виден на archived проектах в списке
- Все существующие тесты продолжают проходить
</success_criteria>

<output>
After completion, create `.planning/quick/260405-roi-archive-readonly-trial-end-rollback-to-f/260405-roi-SUMMARY.md`
</output>
