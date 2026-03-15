---
status: awaiting_human_verify
trigger: "Два бага с автосохранением задач: 1. Новая задача не сохраняется вообще при добавлении; 2. При первом перетаскивании задачи (drag) сохранение не срабатывает — только после второго"
created: 2026-03-13T00:00:00Z
updated: 2026-03-13T00:00:00Z
---

## Current Focus

hypothesis: В useAutoSave есть два off-by-one дефекта, введённые сегодняшним фиксом skipVersion. Ветка `if (skipVersion !== lastSkipVersionRef.current)` срабатывает при ПЕРВОМ рендере с любым skipVersion=0, а токен-ветка сбрасывает hash и ставит skipCountRef=2 — значит первые 2 настоящих изменения задач пропускаются.
test: Трассировка состояния refs по render-последовательности для двух сценариев (добавление задачи, первый drag)
expecting: Оба дефекта объясняются одной и той же проблемой инициализации lastSkipVersionRef/skipCountRef
next_action: Подтвердить гипотезу трассировкой и применить фикс

## Symptoms

expected:
- При добавлении новой задачи она немедленно сохраняется в PostgreSQL
- При первом перемещении задачи (drag) сохранение срабатывает и появляется индикатор "Сохранение"

actual:
- Новая задача не сохраняется (нет запроса PUT /api/tasks после добавления)
- После drag первый раз — тишина, после второго drag — сохранение срабатывает

errors: Нет видимых ошибок

reproduction:
1. Добавить задачу через UI — не сохраняется
2. Перетащить задачу → нет "Сохранение" в footer; перетащить снова → появляется "Сохранение"

started: После сегодняшнего фикса useAutoSave (исправление race condition с skipVersion)

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-13T00:00:00Z
  checked: useAutoSave.ts — порядок проверок в useEffect
  found: |
    Render sequence при загрузке проекта (accessToken уже присутствует при первом render):
    1. Render 1: accessToken != prevTokenRef (null) → устанавливает skipCountRef=2, prevTokenRef=token, lastSavedHashRef='', lastSkipVersionRef=0. RETURN.
    2. Render 2 (tasks=[] после replaceTasksFromSystem): skipVersion=0 === lastSkipVersionRef=0 → НЕ попадаем в skipVersion-ветку. skipCountRef=2>0 → SKIP, skipCountRef=1.
    3. Render 3 (tasks=loadedFromServer): skipCountRef=1>0 → SKIP, skipCountRef=0. lastSavedHashRef всё ещё ''.
    4. Render 4 (пользователь добавил задачу): skipCountRef=0. currentHash != '' → должно сохранить. НО...
       Проблема: replaceTasksFromSystem вызывает setAutoSaveSkipVersion(v=>v+1) И setTasks одновременно.
       React batches оба setState. Следующий render имеет skipVersion=1 и tasks=[loadedFromServer].
       В этом render: skipVersion(1) !== lastSkipVersionRef(0) → ПОПАДАЕМ в skipVersion-ветку:
         lastSkipVersionRef=1, lastSavedHashRef=hash(loadedFromServer). RETURN — сохранения нет.
    5. Следующий render (пользователь добавил задачу): skipCountRef=0. currentHash=hash(tasks+newTask) != hash(loadedFromServer). СОХРАНЕНИЕ СРАБАТЫВАЕТ.
  implication: |
    Но это описывает ПРАВИЛЬНОЕ поведение для первого добавления. Нужно разобраться точнее.

- timestamp: 2026-03-13T00:00:00Z
  checked: useAutoSave.ts строки 101-106 — skipVersion-ветка
  found: |
    ```
    if (skipVersion !== lastSkipVersionRef.current) {
      lastSkipVersionRef.current = skipVersion;
      lastSavedHashRef.current = computeTasksHash(tasks);  // <-- KEY LINE
      return;
    }
    ```
    Когда replaceTasksFromSystem(loadedTasks) вызывается при загрузке проекта:
    - setAutoSaveSkipVersion(v=>v+1) → skipVersion становится 1
    - setTasks(loadedTasks)

    React batches эти обновления. В следующем render:
    - skipVersion=1 !== lastSkipVersionRef=0 → ветка срабатывает
    - lastSavedHashRef = hash(loadedTasks) — ПРАВИЛЬНО, это предотвращает overwrite
    - RETURN

    Следующий render пользователя (добавление задачи):
    - currentHash = hash(loadedTasks + newTask)
    - lastSavedHashRef = hash(loadedTasks)
    - Разные! → сохранение ДОЛЖНО сработать

    Это выглядит корректно... Проверим сценарий с drag.
  implication: Возможно проблема не в skipVersion-ветке, а в skipCount

- timestamp: 2026-03-13T00:00:00Z
  checked: App.tsx строки 552-556 — useEffect при смене проекта
  found: |
    ```
    useEffect(() => {
      if (!auth.isAuthenticated || hasShareToken) return;
      replaceTasksFromSystem([]);
    }, [auth.project?.id, replaceTasksFromSystem, auth.isAuthenticated, hasShareToken]);
    ```

    И useTasks.ts строки 58-64 — после загрузки задач:
    ```
    fetchTasks(accessToken).then(data => {
      if (data) setTasks(data);
    })
    ```

    useTasks.setTasks НЕ вызывает replaceTasksFromSystem — это прямой setTasks!

    Последовательность событий:
    1. accessToken появляется → useAutoSave: token changed, skipCount=2, hash=''
    2. useEffect в App: replaceTasksFromSystem([]) → skipVersion++ (=1), setTasks([])
       В useAutoSave: skipVersion(1) !== lastSkipVersionRef(0) → hash=hash([])='[]'. RETURN.
    3. useTasks fetchTasks завершается → setTasks(loadedTasks) НАПРЯМУЮ (не через replaceTasksFromSystem!)
       В useAutoSave: skipVersion(1) === lastSkipVersionRef(1) → не попадаем в skipVersion-ветку.
       skipCountRef=2>0 → SKIP, skipCountRef=1.
    4. Первое изменение пользователя (добавление задачи или drag):
       skipCountRef=1>0 → SKIP, skipCountRef=0.  ← ВОТ ПЕРВЫЙ БАГ!
    5. Второе изменение пользователя → skipCountRef=0, hash изменился → СОХРАНЕНИЕ.
  implication: |
    КОРЕНЬ БАГ 1 И БАГ 2 НАЙДЕН!

    Проблема: skipCountRef инициализируется в 2 при смене токена, но он "расходует" один счётчик
    на загрузку сервером (setTasks от useTasks), а второй — на ПЕРВОЕ действие пользователя.

    Правильное число skip должно быть:
    - 1: очистка [] через replaceTasksFromSystem (перехвачена skipVersion-веткой → skipCount НЕ тратится)
    - 1: прямой setTasks(loadedData) из useTasks

    Итого нужен skipCount=1, а не 2.

    НО ПОДОЖДИТЕ — skipVersion-ветка перехватывает replaceTasksFromSystem([]) и ставит hash=hash([]).
    Тогда setTasks(loadedData) из useTasks даёт hash(loadedData) != hash([]) → должно сохранить?
    НЕТ — skipCount=2 > 0, поэтому пропускаем! skipCount становится 1.
    Затем первое действие пользователя: skipCount=1 > 0 → ПРОПУСКАЕМ! skipCount становится 0.
    Второе действие: сохраняем!

    Проблема в том, что replaceTasksFromSystem([]) уже обработана skipVersion-веткой (не тратит skipCount),
    но skipCount=2 был выдан при смене токена, ожидая 2 прямых setTasks.
    Теперь же происходит только 1 прямой setTasks (из useTasks load), который съедает skipCount=1,
    и остаётся skipCount=1 — который съедает первое действие пользователя.

## Resolution

root_cause: |
  В useAutoSave.ts при смене токена (login/project switch) skipCountRef устанавливается в 2.
  Это было рассчитано на старую логику: два прямых setTasks (reset + load).

  После сегодняшнего фикса skipVersion, первый вызов (replaceTasksFromSystem([])) теперь
  перехватывается skipVersion-веткой (строки 101-106) и НЕ расходует skipCount.
  Второй вызов (прямой setTasks из useTasks) расходует skipCount: 2→1.

  Остаётся skipCount=1 — который съедает ПЕРВОЕ действие пользователя (добавление задачи или drag).

  Это объясняет оба симптома:
  - Новая задача не сохраняется (первое действие)
  - Первый drag не сохраняется (первое действие)

  Фикс: изменить skipCount с 2 на 1 при смене токена, поскольку replaceTasksFromSystem теперь
  обрабатывается skipVersion-веткой независимо.

fix: |
  В useAutoSave.ts строка 94: изменить `skipCountRef.current = 2;` на `skipCountRef.current = 1;`

verification: |
  Fix applied. Changed skipCountRef.current = 2 to = 1 on line 97 of useAutoSave.ts.
  Updated the comment to explain that replaceTasksFromSystem is intercepted by the skipVersion
  branch and does not consume skipCount. Awaiting human verification in browser.
files_changed:
  - packages/web/src/hooks/useAutoSave.ts
