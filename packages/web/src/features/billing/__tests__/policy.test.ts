import { describe, expect, it } from 'vitest';

import { buildLocalArchiveLimitDenial, buildLocalFreeProjectLimitDenial } from '../policy.ts';

describe('billing policy helpers', () => {
  it('returns a free-plan project limit denial when archived capacity is exhausted', () => {
    const denial = buildLocalFreeProjectLimitDenial({
      billingStatus: {
        plan: 'free',
        planMeta: { label: 'Free' },
      } as never,
      activeProjectCount: 1,
      archivedProjectsCount: 4,
      archivedProjectLimit: 4,
    });

    expect(denial?.code).toBe('PROJECT_LIMIT_REACHED');
    expect(denial?.limitKey).toBe('projects');
    expect(denial?.remaining).toBe(0);
  });

  it('returns an archive denial when the free-plan archive cap is hit', () => {
    const denial = buildLocalArchiveLimitDenial({
      billingStatus: {
        plan: 'free',
        planMeta: { label: 'Free' },
      } as never,
      archivedProjectsCount: 4,
      archivedProjectLimit: 4,
    });

    expect(denial?.code).toBe('ARCHIVE_FEATURE_LOCKED');
    expect(denial?.limitKey).toBe('archive');
  });
});
