# Нужно добавить в систему блок назначения ресурсов на работы

делаем первый этап без перегруза:

Workspace
Portfolio
обновлённый Project
Resource
TaskAssignment

Без календарей, без сложного состава бригады, без план-факта, без skills.
То есть ровно тот минимум, который даст:

несколько проектов в одном пространстве
объединение проектов в портфели
общий пул бригад/ресурсов
назначение бригад на работы
основу для проверки конфликтов
Что меняется по модели
Было

User -> Project -> Task

Станет

User -> Workspace -> Portfolio -> Project -> Task
и отдельно:
Workspace -> Resource
Task <-> Resource через TaskAssignment

Что важно не ломать

Твои текущие Message, ShareLink, TaskRevision, TaskMutation, Dependency можно сохранить почти как есть.
Главная переделка — это верхняя иерархия и добавление ресурсов.




А что если я захочу создать ресурс только внутри проекта а не портфеля?




Это нормальный кейс. И его лучше **поддержать сразу**, но не через привязку ресурса к портфелю, а через **область видимости ресурса**.

То есть ресурс может быть:

* **общий** для workspace/портфеля
* **локальный** только для проекта

Идея такая: не делать отдельные сущности “портфельный ресурс” и “проектный ресурс”, а оставить одну таблицу `Resource`, но дать ей уровень владения.

## Лучший принцип

Ресурс должен принадлежать **одному контейнеру-источнику**:

* либо `workspace`
* либо `project`

Портфель как владелец ресурса я бы **не делал на первом этапе**.

Почему:

* портфель — это в первую очередь группировка проектов
* если ресурс нужен нескольким проектам, почти всегда он по смыслу уже **workspace-level**
* если ресурс нужен только одному объекту, он **project-level**
* портфельный уровень усложняет правила наследования и фильтрации

То есть практически:

* “Штатная бригада плиточников компании” → ресурс workspace
* “Субподрядчик только на объект ЖК Север” → ресурс project
* “Временный кран только на этом объекте” → ресурс project

---

# Как это лучше смоделировать

## Вариант, который я советую

В `Resource` сделать:

* `workspaceId` — обязательно
* `projectId` — опционально

Логика:

* если `projectId = null`, ресурс общий на весь workspace
* если `projectId != null`, ресурс локальный для конкретного проекта

## Prisma

```prisma
model Resource {
  id                String       @id @default(uuid())
  workspaceId       String       @map("workspace_id")
  projectId         String?      @map("project_id")
  name              String
  type              ResourceType
  specialization    String?
  capacity          Float        @default(1)
  defaultUnits      Float        @default(1) @map("default_units")
  defaultCostPerDay Float?       @map("default_cost_per_day")
  color             String?
  isActive          Boolean      @default(true) @map("is_active")
  createdAt         DateTime     @default(now()) @map("created_at")

  workspace   Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  project     Project?         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  assignments TaskAssignment[]

  @@map("resources")
  @@index([workspaceId])
  @@index([projectId])
  @@index([type])
  @@index([specialization])
}
```

И в `Project`:

```prisma
model Project {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  portfolioId String?  @map("portfolio_id")
  createdById String   @map("created_by_id")
  name        String
  createdAt   DateTime @default(now()) @map("created_at")

  workspace      Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  portfolio      Portfolio?       @relation(fields: [portfolioId], references: [id], onDelete: SetNull)
  createdBy      User             @relation("ProjectCreatedBy", fields: [createdById], references: [id], onDelete: Cascade)
  sessions       Session[]
  tasks          Task[]
  messages       Message[]
  shareLinks     ShareLink[]
  taskRevision   TaskRevision?
  assignments    TaskAssignment[]
  localResources Resource[]

  @@map("projects")
  @@index([workspaceId])
  @@index([portfolioId])
  @@index([createdById])
}
```

---

# Как это будет работать в логике

## Для проекта показываем два вида ресурсов:

1. **глобальные ресурсы workspace**

   * `workspaceId = currentWorkspaceId`
   * `projectId IS NULL`

2. **локальные ресурсы проекта**

   * `projectId = currentProjectId`

То есть список доступных ресурсов в проекте:

* все общие
* плюс свои локальные

Это очень удобно.

---

# Почему это лучше, чем делать `portfolioId` у ресурса

Потому что иначе начинается путаница:

ресурс:

* только в одном портфеле?
* может быть в нескольких портфелях?
* если проект переехал в другой портфель, ресурс тоже переедет?
* если бригада нужна двум проектам из разных портфелей, что делать?

С `workspace + optional project` всё гораздо чище:

* общий ресурс = доступен всем проектам workspace
* проектный ресурс = доступен только одному проекту

---

# Какие правила надо зафиксировать

## 1. `projectId` у ресурса должен ссылаться на проект из того же workspace

То есть нельзя, чтобы:

* `resource.workspaceId = A`
* `resource.projectId` указывал на проект из workspace B

Это надо валидировать на уровне сервиса.

## 2. Назначать ресурс можно только:

* на задачи проекта-владельца, если ресурс локальный
* на задачи любого проекта workspace, если ресурс глобальный

Иначе говоря:

### глобальный ресурс

можно назначить на любой проект внутри workspace

### локальный ресурс

можно назначить только на свой проект

---

# Нужна ли тогда привязка ресурса к портфелю

Я бы сказал так:

## На первом этапе — нет

Не нужна.

## Потом, если очень захочешь

Можно сделать у ресурса, например:

* `portfolioId` как фильтр/ярлык
* или отдельную таблицу видимости

Но это уже следующий уровень сложности.

---

# Самая практичная модель доступа

Вот хорошая семаника:

## Resource scope

* `global` — на весь workspace
* `project` — только на проект

Можно даже явным enum:

```prisma
enum ResourceScope {
  workspace
  project
}
```

И тогда в `Resource`:

```prisma
scope ResourceScope @default(workspace)
```

Полная версия:

```prisma
model Resource {
  id                String        @id @default(uuid())
  workspaceId       String        @map("workspace_id")
  projectId         String?       @map("project_id")
  scope             ResourceScope @default(workspace)
  name              String
  type              ResourceType
  specialization    String?
  capacity          Float         @default(1)
  defaultUnits      Float         @default(1) @map("default_units")
  defaultCostPerDay Float?        @map("default_cost_per_day")
  color             String?
  isActive          Boolean       @default(true) @map("is_active")
  createdAt         DateTime      @default(now()) @map("created_at")

  workspace   Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  project     Project?         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  assignments TaskAssignment[]

  @@map("resources")
}
```

Тогда правила простые:

* `scope = workspace` => `projectId = null`
* `scope = project` => `projectId != null`

---

# Как это влияет на UI

В интерфейсе создания ресурса можно дать переключатель:

**Где создать ресурс?**

* Общий для всех проектов
* Только для этого проекта

И этого уже достаточно.

В списке ресурсов можно помечать:

* 🌐 общий
* 📁 проектный

---

# Плюсы такого подхода

1. Не ломаешь идею общего пула ресурсов
2. Поддерживаешь субподрядчиков и временные бригады только на объект
3. Не усложняешь модель портфельным уровнем
4. Легко фильтровать в UI
5. Потом можно “повысить” проектный ресурс до общего

---

# Очень полезный сценарий, который это открывает

Например:

* есть общая бригада электриков компании — глобальный ресурс
* на объекте наняли местную бригаду штукатуров — проектный ресурс
* в графике проекта видны и те, и другие
* при сводной загрузке по портфелю глобальные считаются между проектами, а проектные — только внутри своего проекта

Это очень жизненно.

---

# Что я бы рекомендовал тебе

Для первого этапа я бы обновил прошлую схему так:

* `Resource.workspaceId` — обязательно
* `Resource.projectId` — nullable
* опционально `scope`
* без `portfolioId` у ресурса

Это даст правильную гибкость без лишней сложности.

