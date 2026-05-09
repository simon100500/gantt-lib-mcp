# PRD: Admin Workflow и Automation Pipeline для публикации шаблонов

## 1. Для кого этот документ

Читатель:

- product owner;
- backend/frontend engineer;
- AI/agent engineer;
- future maintainer, который не участвовал в текущем обсуждении.

После прочтения читатель должен уметь:

- реализовать admin workflow создания шаблонов по описанию;
- реализовать automation pipeline, который делает почти всё автоматически;
- понять, почему skill должен быть надстройкой над product workflow, а не первым слоем системы.

## 2. Контекст

Базовый PRD по public templates уже зафиксировал главную модель:

- есть source project;
- есть `template_publication`;
- есть единая база публикаций для marketplace и SEO-site;
- public каталог работает не от live project, а от snapshot publication.

Но этого недостаточно для реального editorial workflow.

Открытым остаётся главный продуктовый вопрос:

- как команда GetGantt должна создавать шаблоны по текстовому описанию;
- как они должны превращаться в source project, publication и SEO-страницу;
- как это сделать максимально автоматически, но с возможностью ручной правки;
- где в этом месте должен появиться skill.

## 3. Проблема

Есть две крайности, и обе плохие.

### Крайность 1. Полностью ручной процесс

Если админ должен:

- вручную создать проект;
- вручную заполнить задачи;
- вручную создать publication;
- вручную написать SEO-текст;

то система слишком дорогая в использовании и не масштабируется.

### Крайность 2. Сразу делать только skill

Если начать со skill-команды вроде:

`добавь шаблон ремонт квартиры`

без полноценного product workflow, возникают проблемы:

- непонятно, куда skill сохраняет source;
- нет стабильной admin queue;
- нет места для ручного review;
- нет UI для republish, SEO-правок и публикационного статуса;
- дебаг становится слишком дорогим, потому что смешиваются:
  - AI generation;
  - publication lifecycle;
  - SEO generation;
  - moderation;
  - продуктовый UI.

Итог:

- skill-first подход кажется быстрым;
- на практике он замедляет систему, потому что автоматизирует недостроенный процесс.

## 4. Цель

Построить admin workflow, в котором:

1. шаблон можно создать по текстовому описанию;
2. source project создаётся автоматически;
3. график генерируется автоматически;
4. publication metadata и SEO draft генерируются автоматически;
5. админ вносит только мелкие правки, если это нужно;
6. после этого шаблон публикуется в marketplace и на сайт;
7. позднее тот же pipeline вызывается через skill без отдельной логики.

Ключевая идея:

- сначала нужно построить product workflow с automation inside;
- только потом добавить text/skill interface как внешний способ запуска того же пайплайна.

## 5. Основное решение

### Решение 1. Нужен admin-only раздел шаблонов в основном продукте

На первом этапе работа с public templates должна жить в `ai.getgantt.ru` внутри отдельного admin раздела.

Не на сайте.
Не в консольных ad hoc скриптах.
Не только через skill.

### Решение 2. Automation должна жить внутри admin workflow

Правильный сценарий не “всё руками” и не “только skill”.

Правильный сценарий:

1. админ вводит описание;
2. система автоматически делает почти всё сама;
3. админ видит результат;
4. если результат нормальный, публикует сразу;
5. если результат требует правки, правит только отдельные поля.

### Решение 3. Skill должен вызывать тот же pipeline

Skill не должен содержать отдельный “магический” сценарий публикации.

Skill должен вызывать тот же workflow, что и admin UI:

- create source;
- generate graph;
- generate publication;
- generate SEO;
- run checks;
- publish or send to review.

## 6. Целевой workflow

## 6.1 Admin flow

1. Админ открывает раздел `Шаблоны`.
2. Нажимает `Создать по описанию`.
3. Указывает:
   - текстовое описание;
   - `kind = template | block`;
   - желаемую категорию или отрасль, если нужно;
   - режим публикации:
     - review required;
     - auto-publish if checks pass.
4. Система создаёт новый source project.
5. Система генерирует график в source project.
6. Система создаёт `template_publication` snapshot.
7. Система генерирует SEO draft.
8. Система строит preview:
   - source graph;
   - publication card;
   - SEO page draft.
9. Админ:
   - публикует сразу;
   - или вносит мелкие правки;
   - или отправляет на republish / regenerate.

## 6.2 Full-auto flow

1. В систему поступает текстовое описание.
2. Pipeline сам создаёт source, publication и SEO.
3. Pipeline прогоняет quality checks.
4. Если checks passed:
   - publication публикуется автоматически.
5. Если checks failed:
   - job попадает в admin review queue.

## 6.3 Skill flow

Пример:

`добавь шаблон ремонт квартиры`

Skill:

1. создаёт job;
2. запускает тот же automation pipeline;
3. возвращает:
   - `published`;
   - или `review_required`;
   - или `failed`.

## 7. Как должен выглядеть admin UI

## 7.1 Новый раздел

В основном web-продукте нужен новый admin-only раздел:

- `Шаблоны`

Он виден только пользователям с admin role.

## 7.2 Внутренняя структура раздела

Минимально нужны три экрана или три вкладки.

### A. Jobs

Показывает generation jobs:

- queued;
- in progress;
- review required;
- ready to publish;
- published;
- failed.

Это operational queue.

### B. Sources

Показывает source projects, которые используются как внутренние шаблонные черновики.

Нужно уметь:

- открыть source;
- увидеть связанный prompt;
- увидеть связанные publications;
- republish;
- archive source.

### C. Publications

Показывает готовые `template_publications`.

Нужно уметь:

- фильтровать по `template` / `block`;
- менять `visibility`;
- менять `verificationStatus`;
- редактировать title / summary / SEO;
- republish из source;
- открывать preview marketplace;
- открывать preview site page.

## 7.3 Главные действия

Минимальный admin action set:

- `Создать по описанию`
- `Сгенерировать заново`
- `Открыть source`
- `Опубликовать как template`
- `Опубликовать как block`
- `Republish`
- `Generate SEO draft`
- `Approve for site`
- `Archive publication`

## 8. Почему source project всё ещё нужен

Source project нужен не как публичный объект, а как рабочий черновик.

Он решает несколько задач:

- админ может вручную поправить график;
- AI может перегенерировать только source, не ломая public page;
- можно переиздавать publication из улучшенного source;
- можно хранить несколько публикаций, происходящих из одного source.

То есть workflow не должен перескакивать напрямую из prompt в publication без source-слоя.

## 9. SEO workflow

SEO-контент должен быть частью publication pipeline, а не внешним ручным процессом.

## 9.1 Что генерируется автоматически

Для каждой publication система генерирует:

- SEO title;
- SEO description;
- long-form page body;
- FAQ;
- use cases;
- common mistakes;
- CTA draft.

## 9.2 Что редактируется вручную

Админ может поправить:

- формулировку title;
- meta description;
- body;
- taxonomy;
- visibility policy;
- verification policy.

## 9.3 Когда страница попадает на сайт

На SEO-site publication попадает только если:

- `status = published`;
- `visibility = site | both`;
- `verificationStatus = verified | editorial`.

## 10. Automation pipeline

Нужен отдельный orchestration layer.

На уровне модели это должен быть job pipeline, а не разрозненный набор кнопок.

## 10.1 Новая сущность

Рекомендуется добавить отдельную сущность generation job.

Например:

- `template_generation_job`

## 10.2 Что должна хранить job

- `id`
- исходный prompt
- requested kind
- requested publication policy
- source owner
- sourceProjectId
- publicationId
- generation status
- automation mode
- seo generation status
- validation report
- error log
- timestamps

## 10.3 Статусы job

Минимальный набор:

- `queued`
- `generating_source`
- `source_ready`
- `generating_publication`
- `generating_seo`
- `review_required`
- `ready_to_publish`
- `published`
- `failed`
- `archived`

## 10.4 Режимы работы

Нужны два режима:

### Manual approval

Automation делает всё до preview.
Финальный publish делает админ.

### Auto-publish if checks pass

Automation публикует без ручного шага, если validation score и policy проходят порог.

## 11. Quality gates

Чтобы automation была безопасной, нужен слой проверок.

Минимально система должна проверять:

- source graph не пустой;
- график содержит разумную структуру;
- publication metadata не пустые;
- slug валиден;
- SEO body не пустой;
- taxonomy заполнена;
- publication snapshot воспроизводим;
- page preview рендерится;
- kind соответствует содержимому:
  - `template` похож на целый сценарий;
  - `block` похож на переиспользуемый модуль.

Если checks не прошли:

- не публиковать автоматически;
- отправлять job в `review_required`.

## 12. Как должен работать skill

Skill нужен, но не как первый этап.

Правильная последовательность:

1. строится admin workflow;
2. строится generation job pipeline;
3. skill вызывает этот pipeline.

Skill-команды могут быть такими:

- `добавь шаблон ремонт квартиры`
- `добавь блок электрика для жилого дома`
- `перегенерируй SEO для публикации ремонт квартиры`
- `опубликуй шаблон ремонт квартиры на сайт`

Skill должен не писать данные напрямую в случайные таблицы, а вызывать официальные source/publication/job APIs.

## 13. Почему не надо начинать только со skill

Если сделать skill раньше admin workflow, появятся системные проблемы:

- не будет review queue;
- не будет понятного источника ошибок;
- не будет визуального места, где редактировать publication и SEO;
- не будет product-owner friendly интерфейса;
- automation станет сложнее сопровождать.

Skill должен уменьшать friction.
Но сначала нужен сам workflow, который он упрощает.

## 14. Rollout plan

### Phase 1. Admin visibility and control

- ввести admin role в web;
- показать admin-only раздел `Шаблоны`;
- сделать базовые экраны `Jobs`, `Sources`, `Publications`.

### Phase 2. Manual publish workflow

- создать source по описанию;
- открыть source в продукте;
- создать publication из source;
- сгенерировать SEO draft;
- опубликовать вручную.

Это первый production-usable релиз.

### Phase 3. Automation inside admin workflow

- добавить generation jobs;
- автоматизировать source generation;
- автоматизировать publication metadata generation;
- автоматизировать SEO generation;
- добавить review queue.

### Phase 4. Auto-publish mode

- добавить quality gates;
- разрешить automatic publish для job, прошедших checks.

### Phase 5. Skill interface

- подключить text command layer;
- skill вызывает тот же pipeline;
- не вводит отдельную доменную логику.

## 15. Что входит в первую реализацию

В первую реализацию этого PRD должны войти:

- admin role detection;
- admin-only раздел `Шаблоны` в основном продукте;
- создание source project по описанию;
- automation шага source generation;
- automation шага publication generation;
- automation шага SEO draft generation;
- preview и ручная правка;
- ручной publish;
- publication queue и status tracking.

## 16. Что пока не входит

- открытая публикация для обычных пользователей;
- полностью безлюдный auto-publish для всех шаблонов;
- сложная SEO-редакционная CMS;
- платные шаблоны;
- creator marketplace;
- сложный ranking/recommendation layer.

## 17. Критерии готовности

Система считается готовой для первого реального релиза, когда:

1. админ может ввести описание нового шаблона;
2. система автоматически создаёт новый source project;
3. система автоматически генерирует график;
4. система автоматически генерирует publication draft;
5. система автоматически генерирует SEO draft;
6. админ может внести только мелкие правки;
7. админ может опубликовать результат в marketplace;
8. админ может отправить результат на сайт;
9. system stores the whole flow as an inspectable job;
10. тот же pipeline можно вызвать через skill без новой бизнес-логики.

## 18. Следующий рабочий шаг

Следующим шагом после этого PRD должен стать implementation plan для vertical slice:

1. admin role в web;
2. sidebar section `Шаблоны`;
3. jobs/source/publications page;
4. create-from-description backend job;
5. SEO draft generation;
6. manual publish controls.
