import { describe, expect, it } from 'vitest';

import { buildLoginRoute, normalizePathname, removeTransientSearchParams, sanitizeNextPath } from '../appRoutes.ts';

describe('app route helpers', () => {
  it('normalizes trailing slashes without touching root', () => {
    expect(normalizePathname('/login/')).toBe('/login');
    expect(normalizePathname('/')).toBe('/');
  });

  it('sanitizes local next paths and rejects foreign origins', () => {
    expect(sanitizeNextPath('/account?tab=billing')).toBe('/account?tab=billing');
    expect(sanitizeNextPath('https://example.com/evil')).toBeNull();
  });

  it('removes transient auth params but preserves stable params', () => {
    expect(removeTransientSearchParams('?auth=otp&next=%2Faccount')).toBe('?next=%2Faccount');
    expect(removeTransientSearchParams('?next=%2Faccount')).toBe('?next=%2Faccount');
  });

  it('builds login routes with encoded next targets', () => {
    expect(buildLoginRoute('/app/new?intent=abc')).toBe('/login?next=%2Fapp%2Fnew%3Fintent%3Dabc');
  });
});
