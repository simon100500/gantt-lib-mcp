function formatBaselineTimestampPart(date: Date, type: 'day' | 'month' | 'year' | 'hour' | 'minute'): string {
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    [type]: type === 'year' ? 'numeric' : '2-digit',
  });

  const match = formatter.formatToParts(date).find((part) => part.type === type)?.value;
  return match ?? '';
}

export function buildDefaultBaselineName(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Базовый';
  }

  const day = formatBaselineTimestampPart(date, 'day');
  const month = formatBaselineTimestampPart(date, 'month');
  const year = formatBaselineTimestampPart(date, 'year');
  const hour = formatBaselineTimestampPart(date, 'hour');
  const minute = formatBaselineTimestampPart(date, 'minute');

  return `Базовый ${day}.${month}.${year} ${hour}:${minute}`;
}
