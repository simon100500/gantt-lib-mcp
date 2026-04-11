import type { PlanningRulePackDefinition } from '../contracts.js';

export const DEFAULT_RULE_PACK: PlanningRulePackDefinition = {
  rulePackKey: 'default_rules',
  mandatoryFamilies: [
    'site_preparation',
    'foundation',
    'superstructure',
    'mep',
  ],
  forbiddenOrderings: [
    'Чистовая отделка не должна предшествовать ключевым черновым MEP работам.',
    'Надземный каркас не должен предшествовать фундаментной готовности.',
  ],
  allowableParallelismPatterns: [
    'Смежные workstreams могут идти параллельно после открытия фронта.',
    'Секционные потоки допустимы при сохранении локальной логики зависимостей.',
  ],
  missingFamilyChecks: [
    'Проверять наличие handover/closeout логики в конце графика.',
    'Проверять, что envelope или локальный scope closure появляется до finish milestones.',
  ],
};
