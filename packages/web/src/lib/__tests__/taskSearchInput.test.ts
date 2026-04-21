import { describe, expect, it } from 'vitest';

import { extractTaskNames, isMultilineTaskInput } from '../taskSearchInput';

describe('taskSearchInput', () => {
  it('extracts trimmed task names from multiline input', () => {
    expect(extractTaskNames('  Первая задача \n\n Вторая задача \r\n Третья задача  ')).toEqual([
      'Первая задача',
      'Вторая задача',
      'Третья задача',
    ]);
  });

  it('returns an empty list for whitespace-only input', () => {
    expect(extractTaskNames(' \n \r\n  ')).toEqual([]);
  });

  it('detects multiline mode when line breaks are present', () => {
    expect(isMultilineTaskInput('Одна строка')).toBe(false);
    expect(isMultilineTaskInput('Одна строка\nВторая строка')).toBe(true);
    expect(isMultilineTaskInput('Одна строка\r\nВторая строка')).toBe(true);
  });
});
