• Правлю domain-reference.ts: убираю чтение файла из .planning и заменяю его на встроенный reference map с теми же stage/work-family id, чтобы поведение сохранилось без runtime-
  файлов.

• Edited packages\server\src\initial-generation\domain-reference.ts (+95 -16)
      1 -import { readFileSync } from 'node:fs';
      2 -
      3 -const CONSTRUCTION_REFERENCE_PATH = new URL(
      4 -  '../../../../.planning/reference/construction-work-intent-map-v3.json',
      5 -  import.meta.url,
      6 -);
      7 -
      8 -type ConstructionReferenceMap = {
      9 -  stages: Array<{
     10 -    id: string;
      1 +type ConstructionReferenceMap = {
      2 +  stages: Array<{
      3 +    id: string;
      4      name: string;
        ⋮
     34    userMessage: string;
     42 -  inferredObjectType?: string | null;
     43 -};
     44 -
     45 -const constructionReference = JSON.parse(
     46 -  readFileSync(CONSTRUCTION_REFERENCE_PATH, 'utf-8'),
     47 -) as ConstructionReferenceMap;
     35 +  inferredObjectType?: string | null;
     36 +};
     37 +
     38 +// Runtime must not depend on .planning artifacts. Keep the minimal reference
     39 +// data in code so production boot remains self-contained.
     40 +const constructionReference: ConstructionReferenceMap = {
     41 +  stages: [
     42 +    {
     43 +      id: 'preconstruction',
     44 +      name: 'Подготовка и проектирование',
     45 +      description: 'Изыскания, ТЗ, проект, разрешения и закупочная подготовка.',
     46 +    },
     47 +    {
     48 +      id: 'site_prep',
     49 +      name: 'Подготовка площадки',
     50 +      description: 'Временные сети, ограждение, мобилизация и подготовка участка.',
     51 +    },
     52 +    {
     53 +      id: 'substructure',
     54 +      name: 'Фундаменты и подземная часть',
     55 +      description: 'Земляные работы, основание, фундамент, гидроизоляция.',
     56 +    },
     57 +    {
     58 +      id: 'superstructure',
     59 +      name: 'Коробка и несущие конструкции',
     60 +      description: 'Стены, перекрытия, каркас, кровельное основание.',
     61 +    },
     62 +    {
     63 +      id: 'mep',
     64 +      name: 'Инженерные системы',
     65 +      description: 'Сантехника, отопление, вентиляция, электрика, слаботочка.',
     66 +    },
     67 +    {
     68 +      id: 'finishing',
     69 +      name: 'Отделка',
     70 +      description: 'Черновая и чистовая отделка, фасады, внутренние покрытия.',
     71 +    },
     72 +    {
     73 +      id: 'landscaping',
     74 +      name: 'Благоустройство',
     75 +      description: 'Наружные сети, дорожки, озеленение, малые формы.',
     76 +    },
     77 +    {
     78 +      id: 'commissioning',
     79 +      name: 'Пусконаладка и сдача',
     80 +      description: 'Пусконаладка, испытания, исполнительная документация, передача.',
     81 +    },
     82 +  ],
     83 +  work_families: [
     84 +    {
     85 +      id: 'mep_sanitary',
     86 +      name: 'Сантехника и отопление',
     87 +      description: 'ВК, отопление, водоснабжение и канализация.',
     88 +    },
     89 +    {
     90 +      id: 'mep_electrical',
     91 +      name: 'Электрика',
     92 +      description: 'Силовые сети, щиты, освещение, заземление.',
     95 +      id: 'mep_low_voltage',
     96 +      name: 'Слаботочные системы',
    102 +      description: 'Перегородки, выравнивание, покрытия, потолки, двери.',
    103 +    },
    104 +    {
    105 +      id: 'roofing',
    106 +      name: 'Кровля',
    107 +      description: 'Стропильная система, утепление, гидроизоляция, покрытие.',
    108 +    },
    109 +    {
    110 +      id: 'openings_glazing',
    111 +      name: 'Окна и остекление',
    112 +      description: 'Оконные блоки, витражи, монтаж и герметизация.',
    113 +    },
    114 +    {
    115 +      id: 'facade_systems',
    116 +      name: 'Фасадные системы',
    117 +      description: 'Утепление, облицовка, подсистема, мокрый фасад.',
    121 +      name: 'Перегородки и ограждающие конструкции',
    122 +      description: 'Внутренние перегородки и локальные ограждающие конструкции.',
    123 +    },
    124 +  ],
    125 +  sequence_rules: [],
    126 +};
    127

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Зависимость от .planning убрана на уровне runtime-кода. Сейчас прогоню сборку сервера, чтобы убедиться, что фикс компилируется и не оставил сломанных импортов.

• Running npm run build:server

• Ran git diff -- packages\server\src\initial-generation\domain-reference.ts
  └ diff --git a/packages/server/src/initial-generation/domain-reference.ts b/packages/server/src/initial-generation/domain-reference.ts
    index 9a0b6b0..ea1a0a9 100644
    … +111 lines
       return constructionReference.stages.find((stage) => stage.id === stageId)?.name ?? stageId;
    warning: in the working copy of 'packages/server/src/initial-generation/domain-reference.ts', LF will be replaced by CRLF the next time Git touches it

• Ran npm run build:server
  └
    > gantt-lib-mcp-server@0.1.0 build:server
    … +12 lines
    > tsc -p tsconfig.json


───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Убрал. Runtime-зависимость от .planning удалена из packages/server/src/initial-generation/domain-reference.ts. Вместо чтения /.planning/reference/construction-work-intent-map-
  v3.json модуль теперь использует встроенный минимальный reference map, так что backend больше не должен падать на старте из-за planning-артефактов.

  Проверка прошла: npm run build:server собирается без ошибок. Дальше нужно просто задеплоить этот фикс; после деплоя сервер должен перестать ловить ENOENT на boot.


› странно вообще что это туда попало! а что этот файл делает? я пока не планировал его добавлять. ну и вынеси эту структуру тогда в файл, но не в planning