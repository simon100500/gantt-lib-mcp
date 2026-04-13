import { describe, it, expect } from 'vitest';
import {
  getArchiveAccess,
  getResourcePoolAccess,
  getExportAccessLevel,
  type UsageStatus,
} from '../useBillingStore';

function makeUsageStatus(
  limits: Record<string, unknown>,
  plan = 'free',
): UsageStatus {
  return {
    plan,
    billingState: plan === 'free' ? 'free' : 'paid_active',
    trialStartedAt: null,
    planMeta: {
      id: plan,
      label: plan === 'free' ? 'Бесплатный' : 'Старт',
      pricing: { monthly: 0, yearly: 0 },
    },
    limits,
    usage: {},
    remaining: {},
  };
}

describe('getArchiveAccess', () => {
  it('returns true when archive limit is true for free plan', () => {
    const status = makeUsageStatus({ archive: true });
    expect(getArchiveAccess(status)).toBe(true);
  });

  it('returns true when archive limit is true (paid plan)', () => {
    const status = makeUsageStatus({ archive: true }, 'start');
    expect(getArchiveAccess(status)).toBe(true);
  });

  it('returns false when status is null', () => {
    expect(getArchiveAccess(null)).toBe(false);
  });

  it('returns false when limits is missing archive key', () => {
    const status = makeUsageStatus({});
    expect(getArchiveAccess(status)).toBe(false);
  });
});

describe('getResourcePoolAccess', () => {
  it('returns false when resource_pool limit is false', () => {
    const status = makeUsageStatus({ resource_pool: false });
    expect(getResourcePoolAccess(status)).toBe(false);
  });

  it('returns true when resource_pool limit is true', () => {
    const status = makeUsageStatus({ resource_pool: true }, 'start');
    expect(getResourcePoolAccess(status)).toBe(true);
  });

  it('returns false when status is null', () => {
    expect(getResourcePoolAccess(null)).toBe(false);
  });
});

describe('getExportAccessLevel', () => {
  it('returns "none" for free plan with export "none"', () => {
    const status = makeUsageStatus({ export: 'none' });
    expect(getExportAccessLevel(status)).toBe('none');
  });

  it('returns "pdf" for start plan with export "pdf"', () => {
    const status = makeUsageStatus({ export: 'pdf' }, 'start');
    expect(getExportAccessLevel(status)).toBe('pdf');
  });

  it('returns "pdf_excel" for team plan', () => {
    const status = makeUsageStatus({ export: 'pdf_excel' }, 'team');
    expect(getExportAccessLevel(status)).toBe('pdf_excel');
  });

  it('returns "pdf_excel_api" for enterprise plan', () => {
    const status = makeUsageStatus({ export: 'pdf_excel_api' }, 'enterprise');
    expect(getExportAccessLevel(status)).toBe('pdf_excel_api');
  });

  it('returns "none" when status is null', () => {
    expect(getExportAccessLevel(null)).toBe('none');
  });

  it('returns "none" when export key is missing from limits', () => {
    const status = makeUsageStatus({});
    expect(getExportAccessLevel(status)).toBe('none');
  });
});
