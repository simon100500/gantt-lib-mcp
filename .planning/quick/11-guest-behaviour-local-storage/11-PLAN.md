---
phase: quick-011
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/App.tsx
  - packages/web/src/hooks/useLocalTasks.ts
autonomous: true
requirements:
  - GUEST-01
  - GUEST-02
must_haves:
  truths:
    - "Незалогиненный пользователь всегда видит ProjectSwitcher с названием проекта в шапке"
    - "Когда пользователь начинает редактировать демо-график, название проекта не исчезает"
    - "После входа локальный отредактированный график сохраняется на сервер как первый проект пользователя"
    - "В demo-режиме (без изменений) при входе локальные demo-задачи НЕ импортируются (используется пустой проект с сервера)"
  artifacts:
    - path: "packages/web/src/App.tsx"
      provides: "Исправленный рендер ProjectSwitcher для гостей + импорт локальных задач при входе"
    - path: "packages/web/src/hooks/useLocalTasks.ts"
      provides: "Экспорт isDemoMode и задач для определения нужно ли импортировать при входе"
  key_links:
    - from: "App.tsx header"
      to: "ProjectSwitcher (guest)"
      via: "!auth.isAuthenticated condition (not isDemoMode)"
      pattern: "!auth.isAuthenticated &&"
    - from: "OtpModal onSuccess"
      to: "PUT /api/tasks"
      via: "fetch с локальными задачами если !isDemoMode"
      pattern: "fetch.*api/tasks.*PUT"
---

<objective>
Исправить два связанных поведения для незалогиненных пользователей:

1. БАГ: При редактировании демо-графика ProjectSwitcher (название проекта) исчезает из шапки.
   Причина: `isDemoMode` становится `false` как только задачи изменились, а ProjectSwitcher для
   гостей рендерится только при `isDemoMode === true`.
   Фикс: показывать ProjectSwitcher для всех `!auth.isAuthenticated` пользователей.

2. ФИЧА: После входа локально отредактированный (не демо) график сохраняется на сервер.
   Текущее поведение: при входе пользователь получает пустой проект, потеряв свою работу.
   Нужное поведение: если `!isDemoMode` (юзер редактировал), после входа делается
   `PUT /api/tasks` с локальными задачами в только что созданный проект.

Purpose: Плавный UX для незалогиненных пользователей — работа не теряется при входе
Output: Исправленный App.tsx
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/web/src/App.tsx
@packages/web/src/hooks/useLocalTasks.ts
@packages/web/src/hooks/useAuth.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix ProjectSwitcher disappearing for guests</name>
  <files>packages/web/src/App.tsx</files>
  <action>
    В App.tsx найти блок рендера в шапке (header), где показывается ProjectSwitcher для гостей
    (примерно строка 272). Изменить условие с `isDemoMode &&` на `!auth.isAuthenticated &&`:

    БЫЛО:
    ```tsx
    } : isDemoMode && (
      <ProjectSwitcher
        currentProject={{ id: 'demo', name: localTasks.projectName || 'Мой проект' }}
        ...
      />
    )}
    ```

    СТАЛО:
    ```tsx
    } : !auth.isAuthenticated && (
      <ProjectSwitcher
        currentProject={{ id: 'demo', name: localTasks.projectName || 'Мой проект' }}
        ...
      />
    )}
    ```

    Переменная `isDemoMode` в App.tsx может остаться (используется для отображения текстовой
    подсказки или других целей) — убедиться что её удаление не ломает другие места.
    Если `isDemoMode` используется только в этом условии — можно удалить её из деструктуризации.

    Проверить: после изменения TypeScript не должен выдавать ошибок.
  </action>
  <verify>
    1. `cd packages/web && npx tsc --noEmit` — без ошибок
    2. Вручную: открыть в инкогнито, увидеть ProjectSwitcher → подвигать задачу → ProjectSwitcher
       должен остаться видимым
  </verify>
  <done>
    Незалогиненный пользователь видит название проекта в шапке как до, так и после редактирования
    демо-графика. `isDemoMode` больше не влияет на видимость ProjectSwitcher.
  </done>
</task>

<task type="auto">
  <name>Task 2: Save local tasks to server on login</name>
  <files>packages/web/src/App.tsx</files>
  <action>
    В App.tsx найти обработчик успешного входа `handleAuthSuccess` (строка ~125) и модальное
    окно OtpModal с его `onSuccess` колбэком (строка ~450).

    Изменить логику: если пользователь редактировал локальный график (`!localTasks.isDemoMode`),
    после входа отправить локальные задачи на сервер через `PUT /api/tasks`.

    Заменить обработчик `onSuccess` в OtpModal примерно так:

    ```tsx
    onSuccess={async (result) => {
      auth.login(result, result.user, result.project);
      setShowOtpModal(false);

      // Если пользователь редактировал локальный график (не демо) — сохранить на сервер
      if (!localTasks.isDemoMode && localTasks.tasks.length > 0) {
        try {
          await fetch('/api/tasks', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${result.accessToken}`,
            },
            body: JSON.stringify(localTasks.tasks),
          });
          // Очистить локальное хранилище после успешного импорта
          localStorage.removeItem('gantt_local_tasks');
          localStorage.removeItem('gantt_demo_mode');
        } catch (err) {
          console.error('Failed to import local tasks after login:', err);
          // Не критическая ошибка — пользователь уже вошёл
        }
      }
    }}
    ```

    ВАЖНО: `result.accessToken` — токен из результата входа (не из state, так как state
    обновляется асинхронно). Использовать токен напрямую из колбэка, не из `auth.accessToken`.

    НЕ трогать `handleAuthSuccess` функцию (она нужна для других мест). Менять только инлайн
    колбэк в JSX OtpModal.
  </action>
  <verify>
    1. `cd packages/web && npx tsc --noEmit` — без ошибок
    2. Вручную:
       a) Открыть в инкогнито
       b) Изменить задачу (переместить, переименовать)
       c) Войти через email/OTP
       d) После входа задачи из локального хранилища должны быть видны в проекте
       e) Повторно войти в инкогнито (не редактируя) — после входа проект должен быть пустым
          (демо-задачи не импортируются)
  </verify>
  <done>
    После входа отредактированный локальный график доступен в аккаунте. Демо-задачи (без
    редактирования) при входе НЕ импортируются. Локальный storage очищается после импорта.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` в packages/web — no errors
- Поведение гостя: ProjectSwitcher виден всегда при `!auth.isAuthenticated`
- При входе с отредактированными задачами: задачи видны в аккаунте после входа
- При входе без редактирования: проект пустой (demo-задачи не импортируются)
</verification>

<success_criteria>
1. В инкогнито после перетаскивания задачи — название проекта в шапке остаётся
2. Вошёл после редактирования — отредактированные задачи в аккаунте
3. Вошёл без редактирования — проект пустой (сервер создаёт пустой проект по умолчанию)
4. TypeScript компилируется без ошибок
</success_criteria>

<output>
After completion, create `.planning/quick/11-guest-behaviour-local-storage/11-SUMMARY.md`
</output>
