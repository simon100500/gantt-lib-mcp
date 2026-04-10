А как бы ты вообще проектировал шаги + промпты создания графика первичного? Какая структура? Без ограничения стека и архитектуры.

Я бы проектировал это не как один большой промпт “построй график”, а как многошаговый конвейер планирования.
То есть модель не сразу рисует задачи, а проходит несколько режимов мышления.

Идея такая:

первичный график = не генерация списка задач, а последовательное принятие решений

что это за проект
какой уровень детализации нужен
из каких стадий он состоит
какие семейства работ обязательны
в каком порядке они идут
что можно распараллелить
какие зависимости критичны
чего не хватает для уверенности
как превратить это в нормальный график

Именно так агент будет меньше галлюцинировать и меньше делать ляпы.

1. Главный принцип

Я бы разделил систему на два слоя:

Слой A. Планировочное мышление

Это reasoning-слой, который отвечает на вопросы:

что это за объект
какой тип графика нужен
какие стадии обязательны
какие типовые work families нужны
какова базовая технологическая последовательность
где есть неопределённость
Слой B. Формирование графика

Это уже более “механический” слой:

создать WBS
создать задачи
выставить длительности
проставить зависимости
назначить календари
выдать warnings

То есть не:

“LLM, придумай график”

А:

“LLM, сначала спланируй модель проекта, потом собери график по этой модели”

2. Ядро пайплайна

Я бы делал примерно 8 шагов.

Шаг 1. Нормализация входа

На вход может прийти:

свободный текст
смета
письмо
КП
перечень работ
уже существующий черновик

Нужно привести всё к единому виду.

Выход шага
{
  "project_summary": "...",
  "raw_constraints": [],
  "known_scope_items": [],
  "unknowns": [],
  "source_confidence": "low | medium | high"
}
Что делает промпт
извлекает тип объекта
извлекает масштаб
извлекает состав работ
извлекает ограничения
отдельно помечает то, что сказано явно, и то, что только предполагается
Почему это важно

Чтобы модель не путала:

“дано пользователем”
“додумано по шаблону”

Это одна из главных проблем в строительном планировании.

Шаг 2. Классификация проекта

Нужно определить:

project_type
object_type
delivery_mode
planning_mode
target_detail_level
Например
{
  "project_type": "fit_out",
  "object_type": "office",
  "planning_mode": "baseline_initial",
  "detail_level": "medium",
  "work_calendar": "ru_standard_5_2"
}
Что здесь важно

Модель должна не только выбрать тип, но и указать уверенность и альтернативы.

{
  "project_type": {
    "value": "fit_out",
    "confidence": 0.92,
    "alternatives": ["reconstruction"]
  }
}
Зачем

Потому что многие реальные проекты смешанные:

реконструкция + отделка
новое строительство + инженерные сети
shell&core + fit-out
Шаг 3. Выбор шаблона планирования

Вот здесь как раз работает твоя логика:
общая канва + адаптация под объект

Выход
{
  "base_template": "fit_out_base_v1",
  "adaptations": [
    "office_rules_v2"
  ],
  "excluded_families": [],
  "added_families": [
    "scs_networks",
    "server_room"
  ]
}
Важный момент

Я бы не хранил шаблон как длинный человеческий текст.
Лучше как структурированные блоки:

стадии
work families
типовые зависимости
опциональные куски
правила включения
Шаг 4. Сборка скелета проекта

Это самый важный planning-step.

Сначала строится не список мелких задач, а скелет графика:

стадии
крупные work families
ключевые вехи
укрупнённые зависимости
Пример выхода
{
  "stages": [
    {
      "code": "prep",
      "name": "Подготовка"
    },
    {
      "code": "rough_build",
      "name": "Черновые общестроительные"
    },
    {
      "code": "rough_mep",
      "name": "Черновая инженерия"
    }
  ],
  "work_families": [
    {
      "code": "partition_walls",
      "stage": "rough_build"
    },
    {
      "code": "electrical_rough_in",
      "stage": "rough_mep"
    }
  ],
  "milestones": [
    "Фронт готов",
    "Черновые завершены",
    "Готово к чистовой отделке",
    "Сдача"
  ]
}
Почему это нужно

Если сразу перейти к задачам, модель легко:

делает хаос
забывает обязательные блоки
путает порядок
строит красивый, но нелогичный список

Скелет — это “несущая система” графика.

Шаг 5. Проверка технологической логики

Я бы делал отдельный шаг валидации ещё до генерации конечных задач.

Агент должен проверить:
нет ли явных нарушений последовательности
все ли обязательные work families включены
есть ли “висящие” семьи без входа/выхода
есть ли циклы
не начаты ли чистовые раньше критических черновых
не пропущены ли подготовительные этапы
Выход
{
  "validation_status": "pass | soft_warning | hard_warning",
  "warnings": [
    {
      "code": "finish_before_rough_complete",
      "message": "Чистовые работы начинаются до завершения части черновой инженерии"
    }
  ]
}
Очень важно

Это должен быть отдельный промпт-валидатор, а не та же модель в том же сообщении.
Иначе она будет защищать собственные ошибки.

Шаг 6. Декомпозиция до задач

Только теперь work families раскладываются в задачи.

Логика

Для каждой family:

выбрать глубину
выбрать типовой task-set
адаптировать под объект
не плодить лишнюю детализацию
Например

partition_walls может стать:

разметка перегородок
монтаж каркасов
зашивка ГКЛ
заполнение
заделка швов

Но на другом уровне детализации это может остаться одной задачей:

устройство перегородок
Критично

Модель должна уметь держать detail policy:

low
medium
high

Иначе она будет то делать 20 строк, то 400.

Шаг 7. Оценка длительностей и зависимостей

Вот это я бы вообще вынес в отдельный специализированный этап.

Потому что “состав задач” и “продолжительность” — это разные когнитивные задачи.

Длительность должна опираться на:
масштаб объекта
объёмы, если есть
тип объекта
типичные темпы
число фронтов
предполагаемую численность бригад
рабочий календарь
Выход
{
  "tasks": [
    {
      "id": "t1",
      "name": "Монтаж перегородок",
      "duration_days": 6,
      "duration_confidence": "medium",
      "basis": "типовой темп для офисного fit-out среднего объема"
    }
  ]
}
Зачем нужен basis

Чтобы потом объяснять пользователю:

откуда взялась оценка
где она точная
где условная
Шаг 8. Финальная сборка графика

И только в конце формируется нормальный объект графика:

WBS
tasks
dependencies
calendars
milestones
buffers
warnings
assumptions
Выход уже в твою доменную схему
{
  "project": { ... },
  "tasks": [ ... ],
  "dependencies": [ ... ],
  "calendars": [ ... ],
  "warnings": [ ... ],
  "assumptions": [ ... ]
}
3. Какая структура промптов

Я бы использовал не один промпт, а набор коротких role-specific промптов.

Prompt A. Intake extractor

Задача:

извлечь факты из входа
не строить график
не додумывать без отметки
Системная роль
Ты модуль нормализации строительного запроса.
Твоя задача — извлечь факты, ограничения и признаки проекта из пользовательского описания.
Не строй график.
Не придумывай задачи.
Четко разделяй:
1. что сказано явно
2. что можно осторожно предположить
3. чего не хватает
Выход

Строгий JSON.

Prompt B. Project classifier

Задача:

определить тип проекта и тип объекта
выбрать planning mode
определить уровень детализации
Системная роль
Ты классификатор строительных проектов для генерации графиков.
Определи тип проекта, класс объекта, ожидаемый режим планирования и уровень детализации.
Выбирай из фиксированного словаря.
Если проект смешанный — укажи основной тип и дополнительные аспекты.
Prompt C. Skeleton planner

Задача:

построить скелет графика
без мелких задач
только стадии, work families, milestone
Системная роль
Ты проектировщик укрупненной структуры графика строительства.
Сначала построй логичный скелет проекта:
- стадии
- семейства работ
- ключевые вехи
- базовые зависимости
Не переходи к мелким задачам, пока не собран правильный каркас.
Prompt D. Technology validator

Задача:

критиковать, а не создавать
Системная роль
Ты технический ревизор графика.
Не улучшай стиль.
Не переписывай все заново.
Проверь только технологическую последовательность, полноту и логические ошибки.
Ищи:
- пропуски обязательных блоков
- неправильный порядок
- нереалистичную параллельность
- висящие элементы
- циклы и конфликты

Это очень важный паттерн.

Prompt E. Task decomposer

Задача:

разложить work family в задачи заданной глубины
Системная роль
Ты декомпозируешь семейства строительных работ в задачи графика.
Соблюдай заданный уровень детализации.
Не создавай лишнюю микродекомпозицию.
Сохраняй строительную логику и пригодность для управления, а не для учебника.
Prompt F. Duration estimator

Задача:

оценить длительности отдельно
объяснить основание
Системная роль
Ты оцениваешь продолжительность задач для первичного графика.
Используй только разумные укрупненные оценки.
Если данных мало — ставь осторожную оценку и помечай низкую уверенность.
Не выдумывай точность.
Prompt G. Graph compiler

Задача:

собрать доменную модель графика
Системная роль
Ты компилятор графика.
Собери итоговую структуру проекта из уже принятых планировочных решений.
Не меняй состав работ без явной причины.
Главная цель — консистентная структура данных для Ганта.
4. Какой должен быть формат знаний

Я бы не хранил знания только промптами.
Лучше разделить их на 4 типа.

1. Словари классификации

Например:

типы проектов
типы объектов
уровни детализации
календари
типы ресурсов
2. Канвы

Например:

fit_out_base
new_building_base
reconstruction_base

Это общий каркас.

3. Адаптационные правила

Например:

office_rules
restaurant_rules
school_rules

Там:

что добавить
что усилить
что убрать
какие зависимости уточнить
4. Техправила / валидаторы

Например:

черновая инженерия обычно до закрытия чистовой
финишные покрытия после мокрых процессов
поставка не должна быть ведущей задачей для основной строительной логики, если она обслуживающая
демонтаж должен открывать фронт

Это уже почти rule engine.

5. Как бы я проектировал output schema

Я бы делал вывод не только “готовый график”, а ещё и следы принятия решений, но в компактной форме.

Примерно так:

{
  "classification": {
    "project_type": "fit_out",
    "object_type": "office",
    "confidence": 0.91
  },
  "planning_policy": {
    "detail_level": "medium",
    "calendar": "ru_5_2",
    "estimation_mode": "template_based"
  },
  "assumptions": [
    "Предполагается стандартный офисный fit-out без тяжелого технологического оборудования"
  ],
  "warnings": [
    "Продолжительности укрупненные, так как объемы не заданы"
  ],
  "wbs": [ ... ],
  "tasks": [ ... ],
  "dependencies": [ ... ]
}
Почему это важно

Потому что дальше:

UI может это показать
агент может на это опираться в следующем ходе
можно редактировать не весь график, а именно assumptions/policy
6. Какой должен быть общий мастер-промпт

Не длинная энциклопедия, а операционная инструкция.

Примерно такого типа:

Твоя цель — создать первичный, управляемый и технологически правдоподобный график строительства.

Принципы:
1. Сначала классифицируй проект, потом строй график.
2. Сначала собирай укрупненную структуру, потом декомпозируй.
3. Не смешивай новое строительство, реконструкцию и fit-out без явной причины.
4. Не создавай учебный перечень работ; создавай график, пригодный для управления.
5. Если данных мало, используй типовую канву и помечай допущения.
6. Не выдумывай избыточную точность в длительностях.
7. Избегай явных нарушений технологической последовательности.
8. Выход должен быть структурированным и пригодным для дальнейшего пересчета на сервере.

Это лучше, чем огромный промпт на 5 экранов с перечислением всех строительных работ.

7. Что я бы сделал архитектурно, если “без ограничений”

Вообще идеальная система была бы такой:

Оркестратор

Управляет шагами пайплайна.

Knowledge layer

Хранит:

канвы
адаптации
правила
словари
Planner agents

Отдельные режимы:

extractor
classifier
skeleton planner
validator
decomposer
estimator
compiler
Deterministic post-processing

Обычный код, который:

нормализует IDs
проверяет циклы
проверяет связность
пересчитывает даты
применяет календарь
ищет orphan tasks
UI explanation layer

Показывает:

что агент предположил
где есть риск
какие блоки созданы по шаблону
8. Самая практичная версия для старта

Если не строить “идеальный космолет”, я бы начал так:

Версия 1

3 промпта:

Classifier + intake
Skeleton planner
Task generator + durations

И 1 кодовый валидатор после LLM:

циклы
висящие задачи
пустые стадии
календарь
нормализация зависимостей
Версия 2

Добавить отдельного LLM-валидатора.

Версия 3

Добавить adaptation rules + retrieval знаний по типу объекта.

9. Самое главное правило

Если совсем сжать до сути, я бы зашил в систему вот такой принцип:

Первичный график создается не из списка задач,
а из последовательности решений:

контекст проекта
→ тип проекта
→ тип объекта
→ базовая канва
→ адаптации
→ укрупненная структура
→ проверка логики
→ декомпозиция
→ длительности и зависимости
→ финальный график

Вот это, на мой взгляд, и есть правильная основа.



/////////////////////////////////////////////////


У меня сейчас есть набор инструментов для создания задач и прочих сущностей на сервере. 

Как ты думаешь, надо давать llm делать через MCP сервер график, или генерировать json и потом алгоритмически выполнять parser executor?

Я бы не давал LLM напрямую строить график через MCP-инструменты шаг за шагом как основной режим.

Оптимальная схема для первичного создания графика:

LLM → план/JSON → parser/executor → сервер

а MCP-инструменты оставить для:

точечных правок
итеративного редактирования
agentic-операций над уже существующим графиком
сложных случаев, где нужен диалог с состоянием

То есть:

первичное создание → лучше через structured plan
последующие изменения → можно через MCP tools

Почему прямой tool-use хуже для первичного создания

Когда LLM сразу начинает:

создать стадию
создать 20 задач
создать 40 связей
обновить длительности
поправить порядок
добавить ещё кусок

получаются типовые проблемы:

1. Хрупкость

Если на 37-м вызове что-то пошло не так:

часть графика уже создана
состояние полуготовое
откат сложен
идемпотентность страдает
2. Дорого и долго

Большой график = много tool calls.
Это:

latency
стоимость
риск рассинхрона
сложнее дебажить
3. Модель начинает “думать в API”, а не в плане

Она вместо нормального проектирования начинает локально латать:

“создам это”
“ой, забыл”
“добавлю ещё”
“теперь связь”

В результате график получается менее цельным.

4. Трудно валидировать до создания

Если она пишет сразу в систему, то ты валидируешь после факта, а не до коммита.

Почему JSON + executor лучше

Потому что это разделяет:

LLM отвечает за:
классификацию проекта
выбор канвы
состав стадий и задач
зависимости на логическом уровне
допущения
Код отвечает за:
создание сущностей
id mapping
транзакционность
идемпотентность
валидацию
пересчёт дат
нормализацию структуры

То есть LLM занимается тем, в чём она сильна,
а сервер — тем, в чём сильнее код.

Какую схему я бы выбрал
Вариант A. LLM сразу вызывает MCP tools

Подходит для:

мелких правок
“добавь 2 задачи”
“сдвинь этап”
“поставь зависимость”
“разбей вот эту работу”

Не лучший для:

первичного построения графика с нуля
Вариант B. LLM генерирует полный JSON-план, executor применяет

Это я бы выбрал как базовый вариант для initial generation.

Поток:
пользователь описал проект
LLM сгенерировала ProjectPlan
сервер прогнал валидаторы
executor создал сущности транзакционно
сервер вернул уже нормализованный truth-state

Это намного чище.

Но не просто “json задач”

Важно: не надо просить LLM выдать сразу сырой список DB-операций.

Лучше, чтобы она выдавала план высокого уровня, а не низкоуровневые create-команды.

То есть не так:

{
  "operations": [
    {"tool": "create_task", "name": "Штукатурка"},
    {"tool": "create_task", "name": "Шпаклевка"}
  ]
}

А так:

{
  "project_classification": {...},
  "stages": [...],
  "task_groups": [...],
  "tasks": [...],
  "dependencies": [...],
  "assumptions": [...],
  "warnings": [...]
}

А уже executor решает:

какие именно серверные методы вызвать
в каком порядке
как создать WBS
как связать parent/child
как строить IDs
как ставить defaults
Мой вердикт
Для первичного графика:
генерировать structured JSON + parser/executor
Для редактирования существующего графика:
можно MCP tool calling
Идеальная гибридная схема

Я бы сделал вообще так:

Режим 1. Draft mode

LLM генерирует:

классификацию
assumptions
skeleton
tasks
dependencies
warnings

Сервер это валидирует и показывает превью.

Режим 2. Commit mode

Executor коммитит это в БД:

одной транзакцией
или staged transaction
с rollback при ошибке
Режим 3. Interactive edit mode

После создания уже можно использовать MCP tools:

add_task
move_task
split_task
link_tasks
assign_resource
Почему это особенно важно у тебя

У тебя график — это не просто список строк.
У тебя там есть:

пересчёт связей
календарь
иерархия
ресурсы
потенциально портфели
в будущем агентские правки и concurrency

Поэтому прямое пошаговое создание через LLM tools быстро упрётся в проблемы:

race conditions
неатомарность
сложный rollback
грязная история мутаций

JSON/executor это сильно упрощает.

Как бы я спроектировал contract

Я бы ввёл 3 уровня структуры.

1. Planning JSON

Что решила модель.

{
  "classification": {},
  "planning_policy": {},
  "stages": [],
  "tasks": [],
  "dependencies": [],
  "assumptions": [],
  "warnings": []
}
2. Normalized Plan

Что принял сервер после валидации.

{
  "normalized_stages": [],
  "normalized_tasks": [],
  "normalized_dependencies": [],
  "validation_report": []
}
3. Execution Result

Что реально создано.

{
  "project_id": "...",
  "created_task_ids": [],
  "created_dependency_ids": [],
  "snapshot_version": 1
}
Очень важный нюанс

Я бы не делал parser как “тупой исполнитель”.
Я бы делал compiler/executor.

То есть он не просто парсит JSON, а:

валидирует
дополняет defaults
строит внутренние IDs
сортирует создание по порядку
выявляет циклы
выявляет orphan tasks
проверяет parents
применяет календарь
при необходимости добавляет системные milestones

То есть это не parser, а почти mini-build-system для графика.

Когда всё-таки стоит дать прямой MCP

Есть случаи, где tool-calling полезен даже для первички:

1. Очень большие проекты по частям

Если график строится итеративно:

сначала этапы
потом один этап
потом ещё один
потом ресурсы

Тогда agent может работать через tools, но лучше всё равно не напрямую в production-state, а в draft workspace.

2. Когда нужен интерактивный reasoning over current state

Например:

“сначала создай укрупнённо”
“теперь детализируй отделку”
“теперь добавь поставки”
“теперь назначь бригады”

Тут tools норм.

3. Когда у тебя есть хороший transactional draft layer

То есть agent может спокойно ошибаться, пока работает в черновике.

Самая практичная рекомендация

Если бы я делал у тебя сейчас, я бы выбрал такой путь:

База

Первичная генерация = JSON plan → executor

Дополнение

Редактирование = MCP tool calls

Позже

Добавить режим:
LLM tool-calling only inside draft graph,
а потом отдельный commit_draft_graph.

Это будет вообще лучший вариант.

Простое правило выбора
Если задача звучит как:
“создай график”
“построй план проекта”
“сгенерируй первичный график”

→ JSON + executor

Если задача звучит как:
“добавь”
“измени”
“сдвинь”
“свяжи”
“разбей”
“переназначь”

→ MCP tools

Итоговая рекомендация
Первичное создание графика:
LLM -> structured plan -> validator/compiler -> transactional executor

Редактирование существующего графика:
LLM -> MCP tools

Это даст:

меньше хаоса
меньше tool spam
лучше качество графика
атомарность
нормальную диагностику ошибок
лучшую масштабируемость архитектуры

Если хочешь, я могу следующим сообщением набросать тебе конкретную JSON-схему GraphPlan и список серверных стадий validatePlan -> compilePlan -> executePlan.

Подскажи это должно быть просто прямая отправка на api (исходное + промпта). Или как то через агента? У меня сейчас через агента всё. Надо ли langchain?

Я бы не завязывал первичное создание графика на “агента” в полном смысле.

Для твоего кейса лучше разделить:

1. Первичное создание графика

не агент, а pipeline / orchestrated generation

То есть по сути:

входные данные
системный промпт(ы)
structured output
серверная валидация
compile/executor

Это можно вызывать как обычный backend flow.
Не обязательно называть это “агентом”.

2. Диалоговые правки графика

вот тут уже агент уместен:

посмотреть текущее состояние
понять намерение пользователя
выбрать инструмент
сделать 1–N действий
объяснить результат
Короткий ответ на твой вопрос
Для первичной генерации графика:
лучше не “через агента”, а через управляемый server-side pipeline
Для редактирования и общения с графиком:
агент подходит
Почему не стоит всё делать через агента

Когда “всё через агента”, он начинает быть слишком универсальным:

и классификатор
и планировщик
и тул-раннер
и валидатор
и исполнитель

Из-за этого:

хуже управляемость
сложнее дебажить
сложнее гарантировать одинаковый результат
сложнее тестировать
больше nondeterminism

Для первичного графика тебе нужен не “умный болтун”, а управляемый конвейер принятия решений.

Как бы я это разложил
Вариант, который я бы рекомендовал
A. Graph Generation Service

Отдельный backend flow:

input
→ normalize
→ classify
→ build skeleton
→ decompose
→ validate
→ compile
→ execute

LLM внутри есть, но снаружи это не агент, а сервис генерации.

B. Graph Editing Agent

Отдельный агентный слой для команд типа:

добавь работы
сдвинь этап
разбей задачу
назначь бригаду
покажи критический путь
почему съехал срок
То есть “агент” нужен, но не везде

Я бы сказал так:

Агент хорош там, где:
есть неопределённость
есть диалог
есть выбор инструментов
есть работа с текущим состоянием
есть итеративность
Агент не обязателен там, где:
flow известен заранее
шаги предсказуемы
нужна воспроизводимость
нужен structured output
важна атомарность

Первичное создание графика как раз больше относится ко второй группе.

Нужно ли просто слать исходное + промпт на API?

Просто один большой запрос “вот описание проекта, построй график” я бы не делал.

Это самый быстрый старт, но не лучший фундамент.

Лучше хотя бы минимальный orchestration:

Минимум
extract/classify
generate_graph_plan
validate/compile/execute

То есть уже 2 LLM-вызова + серверная логика достаточно, чтобы стало сильно лучше.

Нужен ли LangChain?
Коротко:
нет, не нужен по умолчанию

Для твоего кейса я бы не тащил LangChain на старте, если:

у тебя уже есть свой MCP / tools слой
ты контролируешь backend
тебе нужны строгие JSON contracts
pipeline у тебя понятный
Почему я бы не спешил с LangChain
1. Лишний слой абстракции

У тебя и так сложная доменная система:

графики
пересчёт
зависимости
серверная логика
MCP tools
валидация

LangChain сверху часто добавляет:

магию
скрытые состояния
лишние сущности
сложность дебага
2. Ты и сам можешь сделать orchestration проще

Тебе не нужен тяжёлый фреймворк, чтобы сделать:

const extracted = await llm.extract(input)
const plan = await llm.generatePlan(extracted)
const report = validatePlan(plan)
const compiled = compilePlan(plan)
const result = await executePlan(compiled)

Это обычный application service.

3. У тебя не generic chatbot

У тебя не “агентская платформа общего назначения”, а узкий продуктовый pipeline.
В таких случаях часто лучше своя простая orchestration layer, чем универсальный framework.

Когда LangChain может пригодиться

Он может быть полезен позже, если у тебя появится одно из этого:

1. Сложные многокроковые агентные графы

Например:

планировщик
критик
ресурсный оптимизатор
объяснятор
сметный модуль

и всё это в одной оркестрации

2. Нужен стандартный memory / routing / tool stack

Если не хочешь писать своё

3. Хочешь быстро экспериментировать с multi-agent flows
Но даже тогда я бы посмотрел не только на LangChain

Потому что для production orchestration часто лучше:

свой код
явные state machines
явные contracts
job runner / queue
нормальные логи и трассировка

А не “агентный фреймворк ради агентного фреймворка”.

Что бы я сделал на твоём месте
Вариант 1. Самый практичный

Сделать свой orchestration layer на сервере.

Например:
POST /graph/generate

Внутри:

normalizer
classifier
planner
validator
compiler
executor

Каждый шаг — обычная функция или сервис.

LLM вызывается внутри 2–3 шагов.

Плюсы
всё прозрачно
легко тестировать
легко логировать
легко менять модель/промпты
легко делать retries
Вариант 2. Гибрид
Для генерации

обычный orchestration service

Для чата

agent runtime + MCP tools

Это, на мой взгляд, лучший баланс.

Как бы я архитектурно оформил
Сервис 1. GraphGenerationService

Отвечает за первичное создание

generateInitialGraph(input): GraphGenerationResult

Внутри:

extractFacts
classifyProject
buildPlan
validatePlan
compilePlan
executePlan
Сервис 2. GraphAgentService

Отвечает за чатовые правки

handleUserCommand(projectId, message): AgentResult

Внутри:

читает текущее состояние
вызывает MCP tools
делает правки
Как понять, нужен агент или нет

Задай себе простой вопрос:

У этого сценария есть заранее известные шаги?

Если да — не нужен агент, нужен pipeline.

Шаги неизвестны и зависят от ситуации?

Тогда агент полезен.

Для первички шаги у тебя в целом известны.
Значит, тут pipeline.

Мой прямой совет
Сейчас

Не тащи LangChain.

Сделай так
оставь агента для чата и редактирования
первичную генерацию вынеси в отдельный серверный pipeline
вызывай LLM напрямую через свой слой
используй строгие JSON outputs
делай deterministic validator/compiler после LLM
Самая здравая стартовая схема
Пользовательский ввод
→ GraphGenerationService
  → LLM #1: extract + classify
  → LLM #2: build plan
  → code: validate
  → code: compile
  → code: execute
→ готовый график

А потом уже:

Пользователь пишет в чат
→ GraphAgentService
  → анализ команды
  → MCP tools
  → ответ пользователю
Итог
Для первичного создания графика:

не просто один prompt в API, но и не agent runtime

Лучше:
явный backend pipeline с 2–3 LLM вызовами и серверным compiler/executor

Для правок:

агент

LangChain:

скорее нет, чем да
На старте он тебе, вероятно, больше усложнит систему, чем поможет.

Могу следующим сообщением набросать тебе прям конкретную серверную структуру:
какие модули, какие функции, какие DTO и где именно вызывается LLM.

А как делать оркестратора? Что он представляет собой? 

У меня fastify 

Оркестратор в твоём случае — это не отдельная магическая технология.
Это просто серверный application service, который управляет шагами генерации графика в правильном порядке.

С Fastify это вообще нормально ложится.

По сути:

HTTP request
→ route/controller
→ GraphGenerationOrchestrator
   → step 1
   → step 2
   → step 3
   → validate
   → compile
   → execute
→ response

То есть оркестратор — это координатор пайплайна, а не место, где живёт вся бизнес-логика.

Что он собой представляет

Я бы мыслил так:

Оркестратор отвечает за:
порядок шагов
передачу данных между шагами
остановку при ошибке
сбор логов / trace
retry там, где это допустимо
возврат итогового результата
Но он не должен:
содержать всю доменную логику
сам строить график
сам валидировать всё вручную
сам делать SQL
сам знать все детали LLM промптов

То есть он дирижёр, а не весь оркестр.

Как это выглядит в Fastify

Я бы сделал примерно такую структуру:

src/
  modules/
    graph-generation/
      graph-generation.route.ts
      graph-generation.controller.ts
      graph-generation.orchestrator.ts
      graph-generation.types.ts

      steps/
        normalize-input.step.ts
        classify-project.step.ts
        build-skeleton.step.ts
        decompose-tasks.step.ts
        validate-plan.step.ts
        compile-plan.step.ts
        execute-plan.step.ts

      services/
        llm-client.ts
        prompt-registry.ts
        plan-validator.ts
        plan-compiler.ts
        graph-executor.ts

      schemas/
        graph-generation.request.ts
        graph-generation.response.ts
Главная идея

Не делай один огромный generateGraph() на 1000 строк.

Сделай:

orchestrator
steps
services
1. Route

Fastify route принимает запрос.

Например:

fastify.post('/graphs/generate', graphGenerationController.generate)
2. Controller

Контроллер:

валидирует request
вызывает orchestrator
возвращает response

Он должен быть тонким.

Примерно:

export class GraphGenerationController {
  constructor(
    private readonly orchestrator: GraphGenerationOrchestrator,
  ) {}

  async generate(req, reply) {
    const result = await this.orchestrator.run({
      workspaceId: req.user.workspaceId,
      input: req.body.input,
      options: req.body.options,
    })

    return reply.send(result)
  }
}
3. Orchestrator

Вот это и есть сердце процесса.

Он:

создаёт context
вызывает step за step
накапливает результаты
решает, продолжать или нет
Пример mental model
request
→ create context
→ normalize input
→ classify project
→ build graph plan
→ validate
→ compile
→ execute
→ return result
4. Context object

Самая полезная штука — единый context, который передаётся между шагами.

Например:

type GraphGenerationContext = {
  requestId: string
  workspaceId: string
  userInput: string

  normalizedInput?: NormalizedInput
  classification?: ProjectClassification
  skeleton?: GraphSkeleton
  graphPlan?: GraphPlan
  validationReport?: ValidationReport
  compiledPlan?: CompiledPlan
  executionResult?: ExecutionResult

  warnings: WarningItem[]
  logs: StepLog[]
}

Тогда каждый step:

читает из context
пишет в context

Это очень удобно.

Как выглядит orchestrator в коде

Упрощённо:

export class GraphGenerationOrchestrator {
  constructor(
    private readonly normalizeInputStep: NormalizeInputStep,
    private readonly classifyProjectStep: ClassifyProjectStep,
    private readonly buildSkeletonStep: BuildSkeletonStep,
    private readonly decomposeTasksStep: DecomposeTasksStep,
    private readonly validatePlanStep: ValidatePlanStep,
    private readonly compilePlanStep: CompilePlanStep,
    private readonly executePlanStep: ExecutePlanStep,
  ) {}

  async run(input: RunGraphGenerationInput): Promise<RunGraphGenerationResult> {
    const ctx: GraphGenerationContext = {
      requestId: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      userInput: input.input,
      warnings: [],
      logs: [],
    }

    await this.normalizeInputStep.run(ctx)
    await this.classifyProjectStep.run(ctx)
    await this.buildSkeletonStep.run(ctx)
    await this.decomposeTasksStep.run(ctx)
    await this.validatePlanStep.run(ctx)
    await this.compilePlanStep.run(ctx)
    await this.executePlanStep.run(ctx)

    return {
      requestId: ctx.requestId,
      projectId: ctx.executionResult!.projectId,
      warnings: ctx.warnings,
      summary: ctx.executionResult!.summary,
    }
  }
}
Что такое step

Step — это маленький модуль с одной ответственностью.

Например:

export class ClassifyProjectStep {
  constructor(
    private readonly llmClient: LlmClient,
    private readonly promptRegistry: PromptRegistry,
  ) {}

  async run(ctx: GraphGenerationContext): Promise<void> {
    const prompt = this.promptRegistry.get('classify-project')

    const result = await this.llmClient.generateStructured<ProjectClassification>({
      systemPrompt: prompt.system,
      userPrompt: buildClassificationPrompt(ctx.normalizedInput!),
      schema: projectClassificationSchema,
    })

    ctx.classification = result
  }
}
Почему это лучше, чем “одна функция”

Потому что сразу появляются:

1. Тестируемость

Можно отдельно тестить:

classify step
validate step
compile step
2. Наблюдаемость

Можно видеть:

на каком шаге упало
сколько шаг длился
какой был input/output
3. Заменяемость

Можно потом поменять:

один промпт
одну модель
один step
не ломая всё
Какой должен быть жизненный цикл оркестратора

Я бы делал так:

Вариант 1. Синхронный HTTP flow

Для начала хватит.

POST /graphs/generate
→ orchestrator.run()
→ ответ

Подходит если генерация длится условно 5–20 секунд и это ок для UX.

Вариант 2. Job-based orchestration

Если станет тяжелее.

POST /graphs/generate
→ создаём generation job
→ worker запускает orchestrator
→ фронт слушает статус

Для больших графиков это уже может быть лучше.

Но на старте можно не усложнять.

Как бы я спроектировал шаги

Для твоего кейса минимальный разумный набор такой:

Step 1. NormalizeInputStep

Что делает:

чистит вход
объединяет поля
извлекает базовые факты
готовит нормализованный input

Выход:

ctx.normalizedInput
Step 2. ClassifyProjectStep

Что делает:

определяет project type
object type
detail level
planning mode
confidence

Выход:

ctx.classification
Step 3. BuildGraphPlanStep

Что делает:

строит укрупнённый graph plan
стадии
work families
milestones
assumptions

Выход:

ctx.graphPlan
Step 4. ValidatePlanStep

Что делает:

rule validation
логические проверки
полнота
warnings / hard errors

Выход:

ctx.validationReport
Step 5. CompilePlanStep

Что делает:

превращает planning JSON в нормализованный execution plan
строит ids
parent-child
dependency mapping
defaults

Выход:

ctx.compiledPlan
Step 6. ExecutePlanStep

Что делает:

создаёт project / tasks / dependencies
транзакционно
пишет mutation history если надо

Выход:

ctx.executionResult
Очень важная мысль: compile и execute — отдельно

Это прям важно.

Compile

Это:

“собрать корректный внутренний план”
Execute

Это:

“записать его в БД”

Почему разделять:

compile можно тестировать без базы
compile можно использовать для preview
execute остаётся тупее и надёжнее
Как выглядит context подробнее

Я бы сделал что-то такое:

export interface GraphGenerationContext {
  requestId: string
  workspaceId: string
  userId?: string

  userInput: string
  options?: {
    detailLevel?: 'low' | 'medium' | 'high'
    dryRun?: boolean
  }

  normalizedInput?: NormalizedInput
  classification?: ProjectClassification
  graphPlan?: GraphPlan
  validationReport?: ValidationReport
  compiledPlan?: CompiledGraphPlan
  executionResult?: GraphExecutionResult

  warnings: GenerationWarning[]
  logs: GenerationLogEntry[]
  metrics?: {
    startedAt: number
    finishedAt?: number
  }
}
Добавь step runner

Чтобы не писать руками одно и то же, удобно сделать helper:

private async runStep(
  ctx: GraphGenerationContext,
  stepName: string,
  handler: () => Promise<void>,
): Promise<void> {
  const startedAt = Date.now()

  try {
    await handler()
    ctx.logs.push({
      step: stepName,
      status: 'success',
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    ctx.logs.push({
      step: stepName,
      status: 'error',
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}

И дальше:

await this.runStep(ctx, 'normalize-input', async () => {
  await this.normalizeInputStep.run(ctx)
})

Это очень помогает.

Как оркестратор должен работать с ошибками

Я бы ввёл 3 типа ошибок:

1. UserInputError

Когда вход слишком пустой / кривой

2. PlanningError

Когда LLM вернула мусор или план невалиден

3. ExecutionError

Когда не удалось сохранить в БД

Тогда можно красиво отвечать фронту:

“не хватило данных”
“не удалось собрать корректный график”
“ошибка сохранения”
Где хранить промпты

Не в orchestrator.

Сделай PromptRegistry или просто набор файлов:

prompts/
  classify-project.txt
  build-graph-plan.txt

И сервис:

class PromptRegistry {
  get(name: PromptName): PromptTemplate
}

Так будет проще обновлять.

Где вызывать LLM

Не прямо в orchestrator.

Сделай LlmClient / AiPlanningService.

Например:

class LlmClient {
  async generateStructured<T>(params: {
    systemPrompt: string
    userPrompt: string
    schema: ZodSchema<T>
  }): Promise<T> {
    ...
  }
}

И тогда steps используют его.

Как это выглядит целиком
Fastify Route
→ Controller
→ GraphGenerationOrchestrator
   → NormalizeInputStep
   → ClassifyProjectStep
   → BuildGraphPlanStep
   → ValidatePlanStep
   → CompilePlanStep
   → ExecutePlanStep
→ Response
Надо ли делать state machine?

На старте — не обязательно.

Но мыслить можно именно так:

input_received
normalized
classified
planned
validated
compiled
executed
failed

Если потом появятся фоновые jobs, retries, resume — это уже очень пригодится.

Как бы я сделал в Fastify practically
Вариант попроще

Обычные классы/модули, собранные через DI руками или через твой container.

Пример:
graph-generation.route.ts
graph-generation.controller.ts
graph-generation.orchestrator.ts
steps как классы
services как классы

Fastify тут просто HTTP shell.

Псевдокод целиком
export class GraphGenerationOrchestrator {
  constructor(
    private readonly normalizeInputStep: NormalizeInputStep,
    private readonly classifyProjectStep: ClassifyProjectStep,
    private readonly buildGraphPlanStep: BuildGraphPlanStep,
    private readonly validatePlanStep: ValidatePlanStep,
    private readonly compilePlanStep: CompilePlanStep,
    private readonly executePlanStep: ExecutePlanStep,
  ) {}

  async run(command: GenerateGraphCommand): Promise<GenerateGraphResult> {
    const ctx: GraphGenerationContext = {
      requestId: crypto.randomUUID(),
      workspaceId: command.workspaceId,
      userId: command.userId,
      userInput: command.input,
      warnings: [],
      logs: [],
      metrics: { startedAt: Date.now() },
    }

    await this.runStep(ctx, 'normalize', () => this.normalizeInputStep.run(ctx))
    await this.runStep(ctx, 'classify', () => this.classifyProjectStep.run(ctx))
    await this.runStep(ctx, 'plan', () => this.buildGraphPlanStep.run(ctx))
    await this.runStep(ctx, 'validate', () => this.validatePlanStep.run(ctx))
    await this.runStep(ctx, 'compile', () => this.compilePlanStep.run(ctx))
    await this.runStep(ctx, 'execute', () => this.executePlanStep.run(ctx))

    ctx.metrics!.finishedAt = Date.now()

    return {
      requestId: ctx.requestId,
      projectId: ctx.executionResult!.projectId,
      warnings: ctx.warnings,
      logs: ctx.logs,
    }
  }
}
Самая здравая стартовая версия

Я бы на твоём месте сделал очень простой оркестратор v1:

Только 4 шага:
classify
plan
compile
execute

Без переусложнения.

А уже потом добавить:

normalize
validate
resource planning
cost planning
explanation generation
Мой практический совет

Для Fastify это должен быть обычный сервис-класс, который:

вызывается из route handler
держит context
запускает steps
пишет логи по шагам
возвращает результат

Не отдельный микросервис, не LangChain, не супер-агентная магия.

Если хочешь, следующим сообщением я могу набросать тебе прямо готовый TypeScript skeleton под Fastify:

интерфейсы
orchestrator
context
step base class
пример одного LLM step и одного compile step.
Ну то есть внутри несколько эндроинтов? Я имею на 

Не обязательно. Я бы не делал много внешних эндпоинтов для каждого шага.

Для пользователя и фронта лучше так:

Снаружи

обычно 1 основной endpoint:

POST /graphs/generate

или

POST /projects/:projectId/generate-graph

Он запускает весь pipeline целиком.

А внутри

Внутри это уже не “эндпоинты”, а шаги оркестратора:

classify
plan
validate
compile
execute

То есть это просто функции / сервисы / классы внутри backend.

Как я бы разделял
Внешние HTTP endpoints

Это API для фронта или других клиентов.

Их должно быть немного.

Например:

POST /graphs/generate
GET  /graph-generation-jobs/:id
POST /graphs/:id/agent-command
Внутренние шаги оркестрации

Это не HTTP.
Это обычные вызовы кода:

await classifyStep.run(ctx)
await planStep.run(ctx)
await compileStep.run(ctx)
await executeStep.run(ctx)
То есть ответ: нет, не надо делать

Не надо вот так:

POST /generate/classify
POST /generate/plan
POST /generate/validate
POST /generate/compile
POST /generate/execute

для внутренней оркестрации.

Это почти всегда лишнее, если всё живёт в одном Fastify backend.

Когда много endpoint'ов нужны

Только если ты специально хочешь дать фронту управлять шагами.

Например:

вариант с черновиком
POST /graph-drafts
POST /graph-drafts/:id/classify
POST /graph-drafts/:id/plan
POST /graph-drafts/:id/compile
POST /graph-drafts/:id/commit

Но это уже другой UX:
пошаговый мастер / конструктор / debug-интерфейс.

Для обычного создания графика это не обязательно.

Самая нормальная схема для тебя сейчас
Внешне
один endpoint:
POST /graphs/generate
опционально второй:
GET /graph-generation-jobs/:jobId

если процесс будет фоновый

Внутри

Один orchestrator:

generateGraph()
  -> classify()
  -> buildPlan()
  -> validate()
  -> compile()
  -> execute()
Если совсем просто

Можно мыслить так:

endpoint

это дверь

orchestrator

это сценарий внутри здания

steps

это комнаты, через которые проходит сценарий

Практически для Fastify
route
fastify.post('/graphs/generate', controller.generate)
controller
async generate(req, reply) {
  const result = await orchestrator.run(req.body)
  return reply.send(result)
}
orchestrator
async run(input) {
  const ctx = createContext(input)

  await classifyStep.run(ctx)
  await planStep.run(ctx)
  await compileStep.run(ctx)
  await executeStep.run(ctx)

  return buildResponse(ctx)
}
Когда стоит всё же разносить на несколько endpoint'ов

Это уже если ты хочешь один из сценариев:

1. Пошаговый wizard на фронте

Например:

сначала классифицировали
показали пользователю
он поправил
потом строим график
2. Debug / internal admin UI

Чтобы смотреть отдельно:

что вернул classifier
что вернул planner
где сломался compile
3. Async jobs

Если генерация долгая:

стартуем job
отдельно получаем статус
отдельно читаем результат
Мой совет

Для старта сделай так:

API наружу
POST /graphs/generate
Внутри
orchestrator
несколько step classes/services
без внутренних HTTP вызовов

То есть не microservice-style через HTTP самому себе, а обычный код внутри одного приложения.

Если в одном предложении

Оркестратор — это не набор внутренних API-эндпоинтов, а серверный сценарий, который вызывается одним endpoint'ом и дальше внутри гоняет шаги обычными вызовами кода.

Если хочешь, я могу следующим сообщением показать 3 возможные схемы API:

минимальная,
с async job,
с draft/wizard режимом.
 Стоимость дорогая будет?

Коротко:
👉 нет, не будет дорогой — если правильно спроектировать pipeline
👉 у тебя как раз кейс, где можно держать очень контролируемую стоимость

💰 Откуда вообще берётся стоимость

У тебя 3 основных источника:

1. LLM вызовы
классификация
планирование
(иногда) декомпозиция
2. токены (размер контекста)
входной текст
твои промпты
канвы / правила
3. количество шагов
1 большой вызов vs 2–3 маленьких
📊 Приблизительная экономика (очень грубо)

Если сделать правильно:

Первичный график:
2–3 LLM вызова
каждый ~2–6k токенов

👉 Итого:
~5k–15k токенов на график

В рублях (очень грубо по рынку API)

Ты уже примерно оценивал:

👉 ~10 ₽ за генерацию графика — это реалистично

🚨 Где можно случайно “убить” бюджет

Вот реальные грабли:

❌ 1. Огромный промпт с энциклопедией стройки

Если ты в каждый запрос пихаешь:

все типы проектов
все стадии
все work families
все правила

👉 контекст становится 20–50k токенов

💀 стоимость x3–x10

❌ 2. Агент с tool calling на 30 шагов

Если модель:

создаёт 1 задачу за раз
потом ещё одну
потом связь
потом ещё

👉 20–100 вызовов

💀 это уже реально дорого

❌ 3. Перегенерация всего графика при каждой правке

Если при каждом:

“сдвинь задачу”

ты пересобираешь весь график через LLM

💀 это убьёт экономику

✅ Как сделать дешево (правильная схема)

Вот твоя идеальная модель затрат:

1. Первичная генерация (дороже, но 1 раз)
2–3 LLM вызова
≈ 10 ₽
2. Все последующие действия — БЕЗ LLM
пересчёт связей → сервер
перенос задач → сервер
конфликты → сервер
ресурсы → сервер

👉 0 ₽

3. LLM только для “умных” действий

Например:

“добавь этап”
“разбей работу”
“предложи оптимизацию”

👉 1–3 ₽ за действие

📉 Как дополнительно снизить стоимость
✅ 1. Делай 2 шага, а не 5

Вместо:

extract
classify
plan
decompose
estimate

Можно на старте:

👉 1: classify + extract
👉 2: build full plan

✅ 2. Не передавай всю базу знаний в промпте

Сделай:

короткую канву
retrieval (по типу проекта)

👉 экономия x2–x5

✅ 3. Ограничь детализацию

Не надо сразу:

200 задач

Сделай:

30–60 задач

👉 меньше токенов
👉 быстрее
👉 дешевле
👉 и даже лучше UX

✅ 4. Используй structured output

JSON вместо текста:

короче
меньше токенов
меньше мусора
✅ 5. Кэшируй классификацию

Если пользователь редактирует:

не надо каждый раз заново определять тип проекта
📦 Реалистичная юнит-экономика (твой кейс)

Ты уже считал примерно:

генерация: ~10 ₽
правка: ~3 ₽

Если пользователь:

сделал 1 график
сделал 10 правок

👉 ~40 ₽ себестоимость

💡 А теперь важный инсайт

👉 самое дорогое — не генерация графика

👉 самое дорогое — если ты:

делаешь лишние вызовы
делаешь агент без контроля
гоняешь LLM там, где можно кодом
⚖️ Твой идеальный баланс
LLM:
- понять проект
- предложить структуру
- предложить новые задачи

Backend:
- хранение
- пересчёт
- зависимости
- календари
- ресурсы
🚀 Ответ на твой вопрос прямо
Будет ли дорого?

👉 Нет, если:

2–3 LLM вызова на генерацию
дальше всё на сервере
без tool-spam

👉 Да, если:

агент на всё
20+ вызовов
огромные промпты
🔥 Мой практический совет

Сделай ограничение на старте:

максимум 2 LLM вызова на генерацию
максимум 1 LLM вызов на правку

И держись этого.

Если совсем коротко

👉 правильный orchestrator = контроль стоимости

👉 LLM думает, сервер считает