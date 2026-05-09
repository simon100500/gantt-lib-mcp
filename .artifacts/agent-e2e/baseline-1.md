# Agent E2E Report: baseline-1

- Total scenarios: 14
- Successful scenarios: 9
- Success rate: 64.3%

## Scenarios

### log-initial-operator-room
- Status: PASS
- Origin: log
- Description: Initial generation from a short real prompt
- Request: Ремонт операторной
- Route: initial_generation (expected initial_generation)
- Tool calls: 0, accepted mutations: 1, rejected mutations: 0
- Task count: 0 -> 52
- Assistant response: Я подготовил стартовый график проекта с фазами, подэтапами и задачами.
- Judge: success, score=1, matched=true, hasError=false
- Created tasks: Подготовительный этап, Подготовка фронта работ, Обследование операторной, Освобождение операторной, Организация площадки, Устройство временных ограждений, Монтаж временного электроснабжения, Демонтаж, Демонтаж строительных элементов, Демонтаж напольного покрытия, Удаление отделки стен, Демонтаж инженерных элементов
- Source log: 2026-05-08T17:51:22.729Z / Первый проект

### log-initial-online-store
- Status: PASS
- Origin: log
- Description: Initial generation from a structured real business prompt
- Request: нужно запустить интернет-магазин за 2 месяца: дизайн, разработка, каталог, оплата, доставка, тестирование
- Route: initial_generation (expected initial_generation)
- Tool calls: 0, accepted mutations: 1, rejected mutations: 0
- Task count: 0 -> 58
- Assistant response: Я подготовил стартовый график проекта с фазами, подэтапами и задачами.
- Judge: success, score=0.96, matched=true, hasError=false
- Created tasks: Подготовка продукта, Требования и модель запуска, Зафиксировать MVP-состав функций, Определить пользовательские роли, Утвердить критерии запуска, Технологическая база, Выбрать технологический стек, Определить внешние интеграции, Подготовить окружения проекта, Дизайн интерфейса, Пользовательские сценарии, Построить карту пользовательских сценариев
- Source log: 2026-05-08T17:35:00.144Z / Интернет магазин

### log-add-gasn-closeout
- Status: FAIL
- Origin: log
- Description: Add a closeout task at the end of the works
- Request: Добавь сдачу ГАСН в конце работ
- Route: mutation (expected mutation)
- Tool calls: 4, accepted mutations: 1, rejected mutations: 0
- Task count: 4 -> 5
- Assistant response: Добавил задачу «Сдача ГАСН» на 2027-05-10 в блок «Благоустройство и сдача».
- Judge: partial, score=0.5, matched=false, hasError=true
- Created tasks: Сдача ГАСН
- Notes: dependency expectation failed for "Получение разрешения на ввод объекта в эксплуатацию" -> "Сдача ГАСН" | Не создана требуемая зависимость predecessor -> successor: «Получение разрешения на ввод объекта в эксплуатацию» -> «Сдача ГАСН».
- Source log: 2026-04-20T20:47:05.640Z / Тест локал

### log-add-cleaning-to-plaster
- Status: PASS
- Origin: log
- Description: Add a task into an existing branch
- Request: Добавь клининг в штукатурные работы
- Route: mutation (expected mutation)
- Tool calls: 2, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 11
- Assistant response: Добавил задачу «Клининг» в «Штукатурные работы». Она поставлена на 2027-01-17.
- Judge: success, score=1, matched=true, hasError=false
- Created tasks: Клининг
- Changed tasks: Ремонт квартиры, Подготовительные работы, Отделка МОП, Штукатурные работы, Покраска стен в МОП, Электромонтаж, Укладка керамогранита
- Source log: 2026-04-22T11:27:08.687Z / Ремонт квартиры

### log-duration-multiplier
- Status: FAIL
- Origin: log
- Description: Multiply task duration from a real prompt
- Request: Увеличь Штукатурные работы в 2 раза
- Route: mutation (expected mutation)
- Tool calls: 1, accepted mutations: 0, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Не могу увеличить длительность задачи напрямую: в доступных инструментах нет изменения дат/длительности задачи, только сдвиг целиком. Нашёл задачу «Штукатурные работы» (plaster).
- Judge: failure, score=0, matched=false, hasError=true
- Notes: duration multiplier 1.00 < expected 1.8 for "Штукатурные работы" | Длительность задачи «Штукатурные работы» не увеличена (множитель 1.00 вместо >=1.8). | Проектное состояние не отражает запрошенное изменение. | Ответ содержит отказ вместо выполнения требуемой мутации.
- Source log: 2026-04-22T13:32:05.025Z / Ремонт квартиры

### log-duration-delta
- Status: FAIL
- Origin: log
- Description: Add days to duration from a real prompt
- Request: увеличь Покраска стен в МОП на 20 дней
- Route: mutation (expected mutation)
- Tool calls: 1, accepted mutations: 0, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Не могу напрямую увеличить длительность задачи через доступные инструменты. Могу сдвинуть «Покраска стен в МОП» целиком на 20 дней — если это и нужно, напишите «сдвинь».
- Judge: failure, score=0, matched=false, hasError=true
- Notes: duration delta 0 < expected 18 for "Покраска стен в МОП" | Не выполнена мутация длительности задачи | Вместо увеличения duration предложен сдвиг задачи | Фактический delta days = 0, что ниже ожидаемого минимума 18
- Source log: 2026-04-20T21:25:45.841Z / Тест локал

### log-decompose-plaster
- Status: PASS
- Origin: log
- Description: Decompose a task into explicit subtasks from a real prompt
- Request: Разбить задачу «Штукатурные работы» на подзадачи. Уточнения: подготовка, штукатурка стен, осушение
- Route: mutation (expected mutation)
- Tool calls: 3, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 13
- Assistant response: Задача «Штукатурные работы» разбита на 3 подзадачи: «Подготовка», «Штукатурка стен», «Осушение». Они созданы последовательно с FS-связями.
- Judge: success, score=1, matched=true, hasError=false
- Created tasks: Подготовка, Штукатурка стен, Осушение
- Changed tasks: Ремонт квартиры, Подготовительные работы, Отделка МОП, Покраска стен в МОП, Электромонтаж, Укладка керамогранита
- Source log: 2026-05-08T07:53:07.902Z / 88 I Крестовский 15

### synthetic-shift-electrical
- Status: FAIL
- Origin: synthetic
- Description: Shift a task later in natural language
- Request: сдвинь электромонтаж на 3 дня позже
- Route: mutation (expected mutation)
- Tool calls: 1, accepted mutations: 0, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Нашёл 2 задачи: «Электромонтаж» и «Черновой электромонтаж». Какую из них сдвинуть на 3 дня?
- Judge: failure, score=0, matched=false, hasError=true
- Notes: shift delta 0 < expected 3 for "Электромонтаж" | Не выполнено требуемое изменение (mutation) | Задача «Электромонтаж» не была сдвинута на 3 дня | Ответ содержит лишнее уточнение вместо прямого действия

### synthetic-rename-rough-electrical
- Status: PASS
- Origin: synthetic
- Description: Rename a task
- Request: переименуй черновой электромонтаж в Электромонтаж первого этапа
- Route: mutation (expected mutation)
- Tool calls: 2, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Готово: задача «Черновой электромонтаж» переименована в «Электромонтаж первого этапа».
- Judge: success, score=1, matched=true, hasError=false
- Changed tasks: Электромонтаж первого этапа

### synthetic-delete-temporary-fence
- Status: PASS
- Origin: synthetic
- Description: Delete an existing task
- Request: удали временное ограждение
- Route: mutation (expected mutation)
- Tool calls: 2, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 9
- Assistant response: Удалил задачу «Временное ограждение».
- Judge: success, score=1, matched=true, hasError=false
- Deleted tasks: Временное ограждение

### synthetic-link-plaster-paint
- Status: PASS
- Origin: synthetic
- Description: Link two tasks
- Request: свяжи штукатурные работы и покраску стен в МОП
- Route: mutation (expected mutation)
- Tool calls: 3, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Связал «Штукатурные работы» → «Покраска стен в МОП» зависимостью FS. Покраска теперь стоит с 2027-01-18 по 2027-01-23.
- Judge: success, score=0.98, matched=true, hasError=false
- Changed tasks: Ремонт квартиры, Отделка МОП, Покраска стен в МОП, Укладка керамогранита

### synthetic-unlink-plaster-paint
- Status: PASS
- Origin: synthetic
- Description: Unlink two tasks
- Request: убери связь между штукатурными работами и покраской стен в МОП
- Route: mutation (expected mutation)
- Tool calls: 3, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Связь между «Штукатурные работы» и «Покраска стен в МОП» убрана.
- Judge: success, score=1, matched=true, hasError=false
- Changed tasks: Покраска стен в МОП

### synthetic-move-paint-under-electrical
- Status: PASS
- Origin: synthetic
- Description: Move a task into another branch
- Request: перенеси покраску стен в МОП в электромонтаж
- Route: mutation (expected mutation)
- Tool calls: 3, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Перенёс «Покраска стен в МОП» в «Электромонтаж». Даты задачи стали 2027-01-18 — 2027-01-23.
- Judge: success, score=1, matched=true, hasError=false
- Changed tasks: Ремонт квартиры, Подготовительные работы, Отделка МОП, Покраска стен в МОП, Электромонтаж, Укладка керамогранита

### synthetic-combo-add-acceptance-after-plaster
- Status: FAIL
- Origin: synthetic
- Description: Create and link a follow-up task with one user instruction
- Request: добавь приемку штукатурки после штукатурных работ и свяжи ее с покраской стен в МОП
- Route: mutation (expected mutation)
- Tool calls: 7, accepted mutations: 3, rejected mutations: 1
- Task count: 10 -> 11
- Assistant response: Добавил задачу «Приемка штукатурки» после «Штукатурные работы» и связал её с «Покраской стен в МОП». Покраска сдвинулась на 2027-01-19 — 2027-01-24.
- Judge: success, score=1, matched=true, hasError=false
- Created tasks: Приемка штукатурки
- Changed tasks: Ремонт квартиры, Подготовительные работы, Отделка МОП, Покраска стен в МОП, Электромонтаж, Укладка керамогранита

## Conclusions

- The current system did not meet the 80% success target on this live suite.
- The failed cases and structural notes above show where the agent still diverges from user intent or produces execution errors.