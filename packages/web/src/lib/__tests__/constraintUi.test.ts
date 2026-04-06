import { describe, it, expect } from 'vitest';
import {
  buildConstraintModalContent,
  normalizeConstraintDenialPayload,
  type ConstraintDenialPayload,
  type ConstraintLimitKey,
} from '../constraintUi';

describe('ConstraintLimitKey extended types', () => {
  it('accepts archive as a valid limit key in denial payload', () => {
    const denial: ConstraintDenialPayload = {
      code: 'ARCHIVE_FEATURE_LOCKED',
      limitKey: 'archive',
      reasonCode: 'feature_disabled',
      remaining: null,
      plan: 'free',
      planLabel: 'Бесплатный',
      upgradeHint: 'Архив доступен на платных тарифах.',
    };
    const result = normalizeConstraintDenialPayload(denial);
    expect(result).not.toBeNull();
    expect(result!.limitKey).toBe('archive');
    expect(result!.code).toBe('ARCHIVE_FEATURE_LOCKED');
  });

  it('accepts resource_pool as a valid limit key in denial payload', () => {
    const denial: ConstraintDenialPayload = {
      code: 'RESOURCE_POOL_FEATURE_LOCKED',
      limitKey: 'resource_pool',
      reasonCode: 'feature_disabled',
      remaining: null,
      plan: 'free',
      planLabel: 'Бесплатный',
      upgradeHint: 'Пул ресурсов доступен на платных тарифах.',
    };
    const result = normalizeConstraintDenialPayload(denial);
    expect(result).not.toBeNull();
    expect(result!.limitKey).toBe('resource_pool');
    expect(result!.code).toBe('RESOURCE_POOL_FEATURE_LOCKED');
  });

  it('accepts export as a valid limit key in denial payload', () => {
    const denial: ConstraintDenialPayload = {
      code: 'EXPORT_FEATURE_LOCKED',
      limitKey: 'export',
      reasonCode: 'feature_disabled',
      remaining: null,
      plan: 'free',
      planLabel: 'Бесплатный',
      upgradeHint: 'Экспорт доступен на платных тарифах.',
    };
    const result = normalizeConstraintDenialPayload(denial);
    expect(result).not.toBeNull();
    expect(result!.limitKey).toBe('export');
  });
});

describe('buildConstraintModalContent for feature gates', () => {
  it('renders archive gate with Russian label and upgrade to start', () => {
    const denial: ConstraintDenialPayload = {
      code: 'ARCHIVE_FEATURE_LOCKED',
      limitKey: 'archive',
      reasonCode: 'feature_disabled',
      remaining: null,
      plan: 'free',
      planLabel: 'Бесплатный',
      upgradeHint: 'Архив проектов доступен на тарифе Старт и выше.',
    };
    const content = buildConstraintModalContent(denial);
    expect(content.limitLabel).toContain('Архив проектов');
    expect(content.title).toContain('Архив проектов');
    expect(content.upgradeOffer.planId).toBe('start');
  });

  it('renders resource_pool gate with Russian label', () => {
    const denial: ConstraintDenialPayload = {
      code: 'RESOURCE_POOL_FEATURE_LOCKED',
      limitKey: 'resource_pool',
      reasonCode: 'feature_disabled',
      remaining: null,
      plan: 'free',
      planLabel: 'Бесплатный',
      upgradeHint: 'Пул ресурсов доступен на тарифе Старт и выше.',
    };
    const content = buildConstraintModalContent(denial);
    expect(content.limitLabel).toContain('Пул ресурсов');
    expect(content.title).toContain('Пул ресурсов');
  });

  it('renders export gate with pdf access level description for start plan', () => {
    const denial: ConstraintDenialPayload = {
      code: 'EXPORT_FEATURE_LOCKED',
      limitKey: 'export',
      reasonCode: 'feature_disabled',
      remaining: null,
      plan: 'free',
      planLabel: 'Бесплатный',
      upgradeHint: 'Экспорт в PDF доступен на тарифе Старт.',
    };
    const content = buildConstraintModalContent(denial);
    expect(content.limitLabel).toContain('Экспорт');
    expect(content.description).toContain('pdf');
  });

  it('renders export gate with pdf_excel description for team plan upgrade', () => {
    const denial: ConstraintDenialPayload = {
      code: 'EXPORT_FEATURE_LOCKED',
      limitKey: 'export',
      reasonCode: 'feature_disabled',
      remaining: null,
      plan: 'start',
      planLabel: 'Старт',
      upgradeHint: 'Экспорт PDF + Excel доступен на тарифе Команда.',
    };
    const content = buildConstraintModalContent(denial);
    expect(content.description).toContain('pdf_excel');
    expect(content.upgradeOffer.planId).toBe('team');
  });

  it('renders export gate with pdf_excel_api description for enterprise upgrade', () => {
    const denial: ConstraintDenialPayload = {
      code: 'EXPORT_FEATURE_LOCKED',
      limitKey: 'export',
      reasonCode: 'feature_disabled',
      remaining: null,
      plan: 'team',
      planLabel: 'Команда',
      upgradeHint: 'Экспорт PDF + Excel + API доступен на тарифе Корпоративный.',
    };
    const content = buildConstraintModalContent(denial);
    expect(content.description).toContain('pdf_excel_api');
    expect(content.upgradeOffer.planId).toBe('enterprise');
  });
});

describe('legacy compatibility', () => {
  it('still supports projects denial through the same path', () => {
    const denial: ConstraintDenialPayload = {
      code: 'PROJECT_LIMIT_REACHED',
      limitKey: 'projects',
      reasonCode: 'limit_reached',
      remaining: 0,
      plan: 'free',
      planLabel: 'Бесплатный',
      upgradeHint: 'Расширьте тариф, чтобы создавать больше активных проектов.',
    };
    const result = normalizeConstraintDenialPayload(denial);
    expect(result!.limitKey).toBe('projects');
    const content = buildConstraintModalContent(result!);
    expect(content.title).toBe('Пора расширяться');
    expect(content.description).toContain('подключите тариф Старт');
    expect(content.limitLabel).toBe('лимит проектов');
  });

  it('still supports ai_queries denial through the same path', () => {
    const denial: ConstraintDenialPayload = {
      code: 'AI_LIMIT_REACHED',
      limitKey: 'ai_queries',
      reasonCode: 'limit_reached',
      remaining: 0,
      plan: 'free',
      planLabel: 'Бесплатный',
      upgradeHint: 'Перейдите на более высокий тариф.',
    };
    const result = normalizeConstraintDenialPayload(denial);
    expect(result!.limitKey).toBe('ai_queries');
  });
});
