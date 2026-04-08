import { readFileSync } from 'node:fs';

const CONSTRUCTION_REFERENCE_PATH = new URL(
  '../../../../.planning/reference/construction-work-intent-map-v3.json',
  import.meta.url,
);

type ConstructionReferenceMap = {
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

export type DomainReferenceKey =
  | 'private_house'
  | 'kindergarten'
  | 'office_renovation'
  | 'construction';

export type ResolvedDomainReference = {
  referenceKey: DomainReferenceKey;
  projectType: 'private_house' | 'kindergarten' | 'office_renovation' | 'construction';
  defaultInterpretation: 'private_residential_house' | null;
  stageHints: string[];
  parallelWorkstreams: string[];
  domainContextSummary: string;
  source: 'construction-work-intent-map-v3';
};

export type ResolveDomainReferenceInput = {
  userMessage: string;
  inferredObjectType?: string | null;
};

const constructionReference = JSON.parse(
  readFileSync(CONSTRUCTION_REFERENCE_PATH, 'utf-8'),
) as ConstructionReferenceMap;

function pickStageName(stageId: string): string {
  return constructionReference.stages.find((stage) => stage.id === stageId)?.name ?? stageId;
}

function pickWorkFamilyName(workFamilyId: string): string {
  return constructionReference.work_families.find((family) => family.id === workFamilyId)?.name ?? workFamilyId;
}

function inferObjectType(userMessage: string): DomainReferenceKey {
  const message = userMessage.toLowerCase();

  if (/(детск|садик|доу|школ)/i.test(message)) {
    return 'kindergarten';
  }

  if (/(офис|office)/i.test(message) && /(ремонт|fit[- ]?out|renovat)/i.test(message)) {
    return 'office_renovation';
  }

  if (/(частн|коттедж|дом|таунхаус|gasobeton|газобетон)/i.test(message)) {
    return 'private_house';
  }

  return 'construction';
}

function summarizeArea(userMessage: string): string | null {
  const areaMatch = userMessage.match(/(\d+(?:[.,]\d+)?)\s*(?:м2|м²|кв\.?\s*м)/i);
  if (!areaMatch) {
    return null;
  }

  return areaMatch[1].replace(',', '.');
}

export function resolveDomainReference(input: ResolveDomainReferenceInput): ResolvedDomainReference {
  const detectedType = input.inferredObjectType ?? inferObjectType(input.userMessage);
  const area = summarizeArea(input.userMessage);

  switch (detectedType) {
    case 'kindergarten':
      return {
        referenceKey: 'kindergarten',
        projectType: 'kindergarten',
        defaultInterpretation: null,
        stageHints: [
          pickStageName('preconstruction'),
          pickStageName('site_prep'),
          pickStageName('substructure'),
          pickStageName('superstructure'),
          pickStageName('mep'),
          pickStageName('finishing'),
          pickStageName('landscaping'),
          pickStageName('commissioning'),
        ],
        parallelWorkstreams: [
          `${pickWorkFamilyName('mep_sanitary')} + ${pickWorkFamilyName('mep_electrical')}`,
          `${pickWorkFamilyName('int_finishing')} + оснащение помещений`,
        ],
        domainContextSummary:
          'Kindergarten / детский сад: cover approvals, site setup, shell, engineering systems, finishing, landscaping, and handover with child-safety and authority-readiness in mind.',
        source: 'construction-work-intent-map-v3',
      };
    case 'office_renovation':
      return {
        referenceKey: 'office_renovation',
        projectType: 'office_renovation',
        defaultInterpretation: null,
        stageHints: [
          'Обмеры и проектирование fit-out',
          pickWorkFamilyName('enclosing_walls'),
          `${pickWorkFamilyName('mep_sanitary')} / вентиляция`,
          pickWorkFamilyName('mep_electrical'),
          pickWorkFamilyName('mep_low_voltage'),
          pickWorkFamilyName('int_finishing'),
          pickStageName('commissioning'),
        ],
        parallelWorkstreams: [
          `${pickWorkFamilyName('mep_electrical')} + ${pickWorkFamilyName('mep_low_voltage')}`,
          `${pickWorkFamilyName('int_finishing')} + мебель и оборудование`,
        ],
        domainContextSummary: area
          ? `Office renovation / ремонт офиса around ${area} m2 should emphasize surveys, interior partitions, MEP rough-ins, low-current systems, finishing, commissioning, and workspace handover without pretending it is a new-build shell.`
          : 'Office renovation / ремонт офиса should emphasize surveys, interior partitions, MEP rough-ins, low-current systems, finishing, commissioning, and workspace handover without pretending it is a new-build shell.',
        source: 'construction-work-intent-map-v3',
      };
    case 'private_house':
      return {
        referenceKey: 'private_house',
        projectType: 'private_house',
        defaultInterpretation: null,
        stageHints: [
          pickStageName('preconstruction'),
          pickStageName('site_prep'),
          pickStageName('substructure'),
          pickStageName('superstructure'),
          pickStageName('mep'),
          pickStageName('finishing'),
          pickStageName('commissioning'),
        ],
        parallelWorkstreams: [
          `${pickWorkFamilyName('mep_sanitary')} + ${pickWorkFamilyName('mep_electrical')}`,
          `${pickWorkFamilyName('roofing')} + ${pickWorkFamilyName('openings_glazing')}`,
        ],
        domainContextSummary:
          'Private house construction should cover permits, site prep, foundation, shell, roof, envelope closure, engineering rough-ins, finishing, and commissioning with utilities connected before final closeout.',
        source: 'construction-work-intent-map-v3',
      };
    default:
      return {
        referenceKey: 'construction',
        projectType: 'construction',
        defaultInterpretation: 'private_residential_house',
        stageHints: [
          pickStageName('preconstruction'),
          pickStageName('substructure'),
          pickStageName('superstructure'),
          pickStageName('mep'),
          pickStageName('finishing'),
          pickStageName('commissioning'),
        ],
        parallelWorkstreams: [
          `${pickWorkFamilyName('mep_sanitary')} + ${pickWorkFamilyName('mep_electrical')}`,
          `${pickWorkFamilyName('facade_systems')} + ${pickWorkFamilyName('roofing')}`,
        ],
        domainContextSummary:
          'Generic construction fallback: interpret the request as a private residential house / частный жилой дом baseline, keep the scope broad and realistic, and rely on standard construction sequencing instead of niche specialty work.',
        source: 'construction-work-intent-map-v3',
      };
  }
}
