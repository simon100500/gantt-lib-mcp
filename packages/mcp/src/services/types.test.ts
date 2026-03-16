/**
 * Tests for service type definitions and date utilities
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { dateToDomain, domainToDate } from './types.js';

describe('Service Types and Date Utilities', () => {
  describe('dateToDomain', () => {
    it('should convert Date to YYYY-MM-DD string', () => {
      const date = new Date('2026-03-13T00:00:00Z');
      const result = dateToDomain(date);
      assert.strictEqual(result, '2026-03-13');
    });

    it('should handle date with time component', () => {
      const date = new Date('2026-03-13T14:30:45Z');
      const result = dateToDomain(date);
      assert.strictEqual(result, '2026-03-13');
    });

    it('should handle dates with different timezone offsets', () => {
      const date = new Date('2026-03-13T23:59:59Z');
      const result = dateToDomain(date);
      assert.strictEqual(result, '2026-03-13');
    });
  });

  describe('domainToDate', () => {
    it('should convert YYYY-MM-DD string to Date', () => {
      const result = domainToDate('2026-03-13');
      assert.ok(result instanceof Date);
      assert.strictEqual(result.getUTCFullYear(), 2026);
      assert.strictEqual(result.getUTCMonth(), 2); // March is 2 (0-indexed)
      assert.strictEqual(result.getUTCDate(), 13);
    });

    it('should create date at midnight UTC', () => {
      const result = domainToDate('2026-03-13');
      assert.strictEqual(result.getUTCHours(), 0);
      assert.strictEqual(result.getUTCMinutes(), 0);
      assert.strictEqual(result.getUTCSeconds(), 0);
    });
  });

  describe('Date conversion round-trip', () => {
    it('should preserve date value through round-trip conversion', () => {
      const originalDate = new Date('2026-03-13T12:34:56Z');
      const originalDateOnly = new Date('2026-03-13T00:00:00Z');

      const domainStr = dateToDomain(originalDate);
      const resultDate = domainToDate(domainStr);

      // Compare date components only (time should be midnight)
      assert.strictEqual(resultDate.getUTCFullYear(), originalDateOnly.getUTCFullYear());
      assert.strictEqual(resultDate.getUTCMonth(), originalDateOnly.getUTCMonth());
      assert.strictEqual(resultDate.getUTCDate(), originalDateOnly.getUTCDate());
    });
  });
});
