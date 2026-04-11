import { NEW_BUILDING_ARCHETYPE } from './archetypes/new-building.js';
import type {
  FragmentDefinition,
  ObjectProfileDefinition,
  ProjectArchetypeDefinition,
} from './contracts.js';
import { BASEMENT_HANDOVER_FRAGMENT } from './fragments/basement-handover.js';
import { SECTION_FRAGMENT } from './fragments/section-fragment.js';
import { DECOMPOSITION_POLICIES } from './policies/decomposition.js';
import { OFFICE_FITOUT_PROFILE } from './profiles/office-fitout.js';
import { KINDERGARTEN_PROFILE } from './profiles/kindergarten.js';
import { RESIDENTIAL_MULTI_SECTION_PROFILE } from './profiles/residential-multi-section.js';
import { DEFAULT_RULE_PACK } from './rules/default-rules.js';

export const PROJECT_ARCHETYPES: Record<string, ProjectArchetypeDefinition> = {
  new_building: NEW_BUILDING_ARCHETYPE,
};

export const OBJECT_PROFILES: Record<string, ObjectProfileDefinition> = {
  kindergarten: KINDERGARTEN_PROFILE,
  residential_multi_section: RESIDENTIAL_MULTI_SECTION_PROFILE,
  office_fitout: OFFICE_FITOUT_PROFILE,
};

export const FRAGMENT_DEFINITIONS: Record<string, FragmentDefinition> = {
  basement_handover: BASEMENT_HANDOVER_FRAGMENT,
  section_fragment: SECTION_FRAGMENT,
};

export {
  DECOMPOSITION_POLICIES,
  DEFAULT_RULE_PACK,
};
