# Agent E2E Report: baseline-3

- Total scenarios: 14
- Successful scenarios: 13
- Success rate: 92.9%

## Scenarios

### log-initial-operator-room
- Status: FAIL
- Origin: log
- Description: Initial generation from a short real prompt
- Request: Ремонт операторной
- Route: initial_generation (expected initial_generation)
- Tool calls: 0, accepted mutations: 0, rejected mutations: 1
- Task count: 0 -> 0
- Assistant response: Не удалось подготовить надежный стартовый график по этому запросу.
- Judge: failure, score=0, matched=false, hasError=true
- Notes: task count 0 < expected minimum 8 | Task count is 0, below the minimum expected 8. | No initial schedule was produced for the requested project. | Assistant response indicates failure instead of generating the requested plan.
- Source log: 2026-05-08T17:51:22.729Z / Первый проект

### log-initial-online-store
- Status: PASS
- Origin: log
- Description: Initial generation from a structured real business prompt
- Request: нужно запустить интернет-магазин за 2 месяца: дизайн, разработка, каталог, оплата, доставка, тестирование
- Route: initial_generation (expected initial_generation)
- Tool calls: 0, accepted mutations: 1, rejected mutations: 0
- Task count: 0 -> 47
- Assistant response: Я подготовил стартовый график проекта с фазами, подэтапами и задачами.
- Judge: success, score=0.98, matched=true, hasError=false
- Created tasks: Подготовка запуска, Требования и состав запуска, Определить состав релиза, Зафиксировать пользовательские сценарии, Утвердить функциональные требования, Платформа и операционная подготовка, Выбрать технологический стек, Подготовить проектные окружения, Настроить контур управления проектом, Дизайн интерфейса, Визуальная система, Определить визуальный стиль
- Source log: 2026-05-08T17:35:00.144Z / Интернет магазин

### log-add-gasn-closeout
- Status: PASS
- Origin: log
- Description: Add a closeout task at the end of the works
- Request: Добавь сдачу ГАСН в конце работ
- Route: mutation (expected mutation)
- Tool calls: 5, accepted mutations: 1, rejected mutations: 0
- Task count: 4 -> 5
- Assistant response: Добавил задачу «Сдача ГАСН» в конец работ на 2027-05-05 с зависимостью после «Получение разрешения на ввод объекта в эксплуатацию».
- Judge: success, score=1, matched=true, hasError=false
- Created tasks: Сдача ГАСН
- Changed tasks: Благоустройство и сдача
- Source log: 2026-04-20T20:47:05.640Z / Тест локал

### log-add-cleaning-to-plaster
- Status: PASS
- Origin: log
- Description: Add a task into an existing branch
- Request: Добавь клининг в штукатурные работы
- Route: mutation (expected mutation)
- Tool calls: 2, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 11
- Assistant response: Добавил задачу «Клининг» в «Штукатурные работы» на 2027-01-17.
- Judge: success, score=1, matched=true, hasError=false
- Created tasks: Клининг
- Changed tasks: Ремонт квартиры, Подготовительные работы, Отделка МОП, Штукатурные работы, Покраска стен в МОП, Электромонтаж, Укладка керамогранита
- Source log: 2026-04-22T11:27:08.687Z / Ремонт квартиры

### log-duration-multiplier
- Status: PASS
- Origin: log
- Description: Multiply task duration from a real prompt
- Request: Увеличь Штукатурные работы в 2 раза
- Route: mutation (expected mutation)
- Tool calls: 2, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Увеличил «Штукатурные работы» в 2 раза: длительность стала 20 дней. Связанные задачи по цепочке сдвинулись автоматически.
- Judge: success, score=1, matched=true, hasError=false
- Changed tasks: Ремонт квартиры, Отделка МОП, Штукатурные работы, Покраска стен в МОП, Укладка керамогранита
- Source log: 2026-04-22T13:32:05.025Z / Ремонт квартиры

### log-duration-delta
- Status: PASS
- Origin: log
- Description: Add days to duration from a real prompt
- Request: увеличь Покраска стен в МОП на 20 дней
- Route: mutation (expected mutation)
- Tool calls: 2, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Увеличил «Покраска стен в МОП» на 20 дней. Теперь задача идёт с 2026-12-31 по 2027-01-25.
- Judge: success, score=1, matched=true, hasError=false
- Changed tasks: Ремонт квартиры, Отделка МОП, Покраска стен в МОП
- Source log: 2026-04-20T21:25:45.841Z / Тест локал

### log-decompose-plaster
- Status: PASS
- Origin: log
- Description: Decompose a task into explicit subtasks from a real prompt
- Request: Разбить задачу «Штукатурные работы» на подзадачи. Уточнения: подготовка, штукатурка стен, осушение
- Route: mutation (expected mutation)
- Tool calls: 3, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 13
- Assistant response: Задача «Штукатурные работы» разбита на 3 подзадачи: «Подготовка», «Штукатурка стен», «Осушение». Последующие работы сдвинулись автоматически: «Покраска стен в МОП» теперь начинается 2027-01-18.
- Judge: success, score=1, matched=true, hasError=false
- Created tasks: Подготовка, Штукатурка стен, Осушение
- Changed tasks: Ремонт квартиры, Подготовительные работы, Отделка МОП, Покраска стен в МОП, Электромонтаж, Укладка керамогранита
- Source log: 2026-05-08T07:53:07.902Z / 88 I Крестовский 15

### synthetic-shift-electrical
- Status: PASS
- Origin: synthetic
- Description: Shift a task later in natural language
- Request: сдвинь электромонтаж на 3 дня позже
- Route: mutation (expected mutation)
- Tool calls: 2, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Сдвинул «Электромонтаж» на 3 дня позже: теперь 11.01.2027–15.01.2027.
- Judge: success, score=1, matched=true, hasError=false
- Changed tasks: Ремонт квартиры, Электромонтаж, Черновой электромонтаж

### synthetic-rename-rough-electrical
- Status: PASS
- Origin: synthetic
- Description: Rename a task
- Request: переименуй черновой электромонтаж в Электромонтаж первого этапа
- Route: mutation (expected mutation)
- Tool calls: 2, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Переименовал: «Черновой электромонтаж» → «Электромонтаж первого этапа».
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
- Assistant response: Задача «Временное ограждение» удалена.
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
- Assistant response: Связал: «Штукатурные работы» → «Покраска стен в МОП» по FS. Даты покраски сместились на 2027-01-18 — 2027-01-23.
- Judge: success, score=1, matched=true, hasError=false
- Changed tasks: Ремонт квартиры, Отделка МОП, Покраска стен в МОП, Укладка керамогранита

### synthetic-unlink-plaster-paint
- Status: PASS
- Origin: synthetic
- Description: Unlink two tasks
- Request: убери связь между штукатурными работами и покраской стен в МОП
- Route: mutation (expected mutation)
- Tool calls: 3, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Связь между «Штукатурные работы» и «Покраска стен в МОП» удалена.
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
- Status: PASS
- Origin: synthetic
- Description: Create and link a follow-up task with one user instruction
- Request: добавь приемку штукатурки после штукатурных работ и свяжи ее с покраской стен в МОП
- Route: mutation (expected mutation)
- Tool calls: 5, accepted mutations: 2, rejected mutations: 0
- Task count: 10 -> 11
- Assistant response: Добавил задачу «Приемка штукатурки» после «Штукатурных работ» и связал её с «Покраской стен в МОП». Покраска сдвинулась на 2027-01-19–2027-01-24.
- Judge: success, score=1, matched=true, hasError=false
- Created tasks: Приемка штукатурки
- Changed tasks: Ремонт квартиры, Подготовительные работы, Отделка МОП, Покраска стен в МОП, Электромонтаж, Укладка керамогранита

## Conclusions

- The current system met the 80% success target on this live suite.