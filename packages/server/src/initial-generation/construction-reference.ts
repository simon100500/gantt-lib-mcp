export type ConstructionReferenceMap = {
  stages: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  work_families: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  sequence_rules?: Array<{
    statement: string;
  }>;
};

// Runtime reference data for construction-oriented initial generation.
// This intentionally lives in src instead of .planning so production boot
// does not depend on planning artifacts being deployed.
export const constructionReference: ConstructionReferenceMap = {
  stages: [
    {
      id: 'preconstruction',
      name: 'Подготовка и проектирование',
      description: 'Изыскания, ТЗ, проект, разрешения и закупочная подготовка.',
    },
    {
      id: 'site_prep',
      name: 'Подготовка площадки',
      description: 'Временные сети, ограждение, мобилизация и подготовка участка.',
    },
    {
      id: 'substructure',
      name: 'Фундаменты и подземная часть',
      description: 'Земляные работы, основание, фундамент, гидроизоляция.',
    },
    {
      id: 'superstructure',
      name: 'Коробка и несущие конструкции',
      description: 'Стены, перекрытия, каркас, кровельное основание.',
    },
    {
      id: 'mep',
      name: 'Инженерные системы',
      description: 'Сантехника, отопление, вентиляция, электрика, слаботочка.',
    },
    {
      id: 'finishing',
      name: 'Отделка',
      description: 'Черновая и чистовая отделка, фасады, внутренние покрытия.',
    },
    {
      id: 'landscaping',
      name: 'Благоустройство',
      description: 'Наружные сети, дорожки, озеленение, малые формы.',
    },
    {
      id: 'commissioning',
      name: 'Пусконаладка и сдача',
      description: 'Пусконаладка, испытания, исполнительная документация, передача.',
    },
  ],
  work_families: [
    {
      id: 'mep_sanitary',
      name: 'Сантехника и отопление',
      description: 'ВК, отопление, водоснабжение и канализация.',
    },
    {
      id: 'mep_electrical',
      name: 'Электрика',
      description: 'Силовые сети, щиты, освещение, заземление.',
    },
    {
      id: 'mep_low_voltage',
      name: 'Слаботочные системы',
      description: 'СКС, СКУД, пожарка, видеонаблюдение, связь.',
    },
    {
      id: 'int_finishing',
      name: 'Внутренняя отделка',
      description: 'Перегородки, выравнивание, покрытия, потолки, двери.',
    },
    {
      id: 'roofing',
      name: 'Кровля',
      description: 'Стропильная система, утепление, гидроизоляция, покрытие.',
    },
    {
      id: 'openings_glazing',
      name: 'Окна и остекление',
      description: 'Оконные блоки, витражи, монтаж и герметизация.',
    },
    {
      id: 'facade_systems',
      name: 'Фасадные системы',
      description: 'Утепление, облицовка, подсистема, мокрый фасад.',
    },
    {
      id: 'enclosing_walls',
      name: 'Перегородки и ограждающие конструкции',
      description: 'Внутренние перегородки и локальные ограждающие конструкции.',
    },
  ],
  sequence_rules: [],
};
