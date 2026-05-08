# Agent E2E Report: baseline-2

- Total scenarios: 14
- Successful scenarios: 12
- Success rate: 85.7%

## Scenarios

### log-initial-operator-room
- Status: PASS
- Origin: log
- Description: Initial generation from a short real prompt
- Request: Ремонт операторной
- Route: initial_generation (expected initial_generation)
- Tool calls: 0, accepted mutations: 1, rejected mutations: 0
- Task count: 0 -> 59
- Assistant response: Я подготовил стартовый график проекта с фазами, подэтапами и задачами.
- Judge: success, score=1, matched=true, hasError=false
- Created tasks: Подготовительный этап, Организация рабочей зоны, Освобождение операторной от мебели, Устройство защитных укрытий на сохраняемых элементах, Организация временного складирования материалов, Подготовка фронта работ, Отключение локальных инженерных линий, Разметка зон демонтажа, Разметка монтажных осей, Демонтажные работы, Демонтаж отделочных покрытий, Демонтаж напольного покрытия
- Source log: 2026-05-08T17:51:22.729Z / Первый проект

### log-initial-online-store
- Status: PASS
- Origin: log
- Description: Initial generation from a structured real business prompt
- Request: нужно запустить интернет-магазин за 2 месяца: дизайн, разработка, каталог, оплата, доставка, тестирование
- Route: initial_generation (expected initial_generation)
- Tool calls: 0, accepted mutations: 1, rejected mutations: 0
- Task count: 0 -> 56
- Assistant response: Я подготовил стартовый график проекта с фазами, подэтапами и задачами.
- Judge: success, score=1, matched=true, hasError=false
- Created tasks: Подготовка проекта, Определение продукта, Собрать требования к интернет-магазину, Определить ассортиментную модель, Утвердить состав первого релиза, Подготовка операционной модели, Описать процесс оформления заказа, Подготовить правила оплаты и доставки, Дизайн интерфейса, Проектирование пользовательского пути, Спроектировать пользовательский сценарий покупки, Сформировать структуру разделов магазина
- Source log: 2026-05-08T17:35:00.144Z / Интернет магазин

### log-add-gasn-closeout
- Status: FAIL
- Origin: log
- Description: Add a closeout task at the end of the works
- Request: Добавь сдачу ГАСН в конце работ
- Route: mutation (expected mutation)
- Tool calls: 3, accepted mutations: 1, rejected mutations: 0
- Task count: 4 -> 5
- Assistant response: Добавил задачу «Сдача ГАСН» в конце работ, после «Подготовка исполнительной документации».
- Judge: partial, score=0.5, matched=false, hasError=true
- Created tasks: Сдача ГАСН
- Changed tasks: Благоустройство и сдача
- Notes: dependency expectation failed for "Получение разрешения на ввод объекта в эксплуатацию" -> "Сдача ГАСН" | Неверная связь предшественника и преемника: ожидалась зависимость «Получение разрешения на ввод объекта в эксплуатацию» -> «Сдача ГАСН», но создана другая. | Хотя имя новой задачи совпадает, итоговое изменение не полностью соответствует запросу.
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
- Tool calls: 3, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Готово: «Штукатурные работы» увеличены в 2 раза, теперь длительность 20 дней. Связанные задачи сдвинулись автоматически.
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
- Status: FAIL
- Origin: log
- Description: Decompose a task into explicit subtasks from a real prompt
- Request: Разбить задачу «Штукатурные работы» на подзадачи. Уточнения: подготовка, штукатурка стен, осушение
- Route: mutation (expected mutation)
- Tool calls: 3, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 13
- Assistant response: Готово: у «Штукатурные работы» созданы подзадачи «Подготовка», «Штукатурка стен» и «Осушение» с последовательностью FS.  
Связанные сроки пересчитались: «Покраска стен в МОП» теперь начинается 2027-01-18.
- Judge: partial, score=0.7, matched=false, hasError=true
- Created tasks: Подготовка, Штукатурка стен, Осушение
- Changed tasks: Ремонт квартиры, Подготовительные работы, Отделка МОП, Покраска стен в МОП, Электромонтаж, Укладка керамогранита
- Notes: Несовпадение точных названий подзадач с ожидаемыми: 'Подготовка' вместо 'подготовка', 'Штукатурка стен' вместо 'штукатурка стен', 'Осушение' вместо 'осушение'.
- Source log: 2026-05-08T07:53:07.902Z / 88 I Крестовский 15

### synthetic-shift-electrical
- Status: PASS
- Origin: synthetic
- Description: Shift a task later in natural language
- Request: сдвинь электромонтаж на 3 дня позже
- Route: mutation (expected mutation)
- Tool calls: 2, accepted mutations: 1, rejected mutations: 0
- Task count: 10 -> 10
- Assistant response: Сдвинул «Электромонтаж» на 3 дня позже: теперь 2027-01-11 — 2027-01-15. Также сдвинулась вложенная задача «Черновой электромонтаж».
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
- Assistant response: Связь создана: «Штукатурные работы» → «Покраска стен в МОП» (FS). Покраска теперь стоит на 2027-01-18 — 2027-01-23.
- Judge: success, score=1, matched=true, hasError=false
- Changed tasks: Ремонт квартиры, Отделка МОП, Покраска стен в МОП, Укладка керамогранита

### synthetic-unlink-plaster-paint
- Status: PASS
- Origin: synthetic
- Description: Unlink two tasks
- Request: убери связь между штукатурными работами и покраской стен в МОП
- Route: mutation (expected mutation)
- Tool calls: 4, accepted mutations: 1, rejected mutations: 0
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
- Assistant response: Перенёс «Покраска стен в МОП» в «Электромонтаж». Теперь задача находится в этом разделе и стоит на 18.01.2027–23.01.2027.
- Judge: success, score=1, matched=true, hasError=false
- Changed tasks: Ремонт квартиры, Подготовительные работы, Отделка МОП, Покраска стен в МОП, Электромонтаж, Укладка керамогранита

### synthetic-combo-add-acceptance-after-plaster
- Status: PASS
- Origin: synthetic
- Description: Create and link a follow-up task with one user instruction
- Request: добавь приемку штукатурки после штукатурных работ и свяжи ее с покраской стен в МОП
- Route: mutation (expected mutation)
- Tool calls: 6, accepted mutations: 3, rejected mutations: 0
- Task count: 10 -> 11
- Assistant response: Готово: добавил задачу «Приемка штукатурки» после «Штукатурные работы» и связал её с «Покраска стен в МОП». Покраска теперь начинается после приемки — с 2027-01-19.
- Judge: success, score=1, matched=true, hasError=false
- Created tasks: Приемка штукатурки
- Changed tasks: Ремонт квартиры, Подготовительные работы, Отделка МОП, Покраска стен в МОП, Электромонтаж, Укладка керамогранита

## Conclusions

- The current system met the 80% success target on this live suite.