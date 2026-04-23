function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function parseTimestampPartsFromString(value: string): {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
} | null {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})(?:[T\s](?<hour>\d{2}):(?<minute>\d{2}))?/);

  if (!isoMatch?.groups) {
    return null;
  }

  return {
    day: isoMatch.groups.day,
    month: isoMatch.groups.month,
    year: isoMatch.groups.year,
    hour: isoMatch.groups.hour ?? '00',
    minute: isoMatch.groups.minute ?? '00',
  };
}

function getTimestampParts(value: Date | string): {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
} | null {
  if (typeof value === 'string') {
    const parsed = parseTimestampPartsFromString(value);
    if (parsed) {
      return parsed;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    day: padTwoDigits(date.getDate()),
    month: padTwoDigits(date.getMonth() + 1),
    year: String(date.getFullYear()),
    hour: padTwoDigits(date.getHours()),
    minute: padTwoDigits(date.getMinutes()),
  };
}

export function buildDefaultBaselineName(value: Date | string = new Date()): string {
  const parts = getTimestampParts(value);

  if (!parts) {
    return 'Базовый';
  }

  return `Базовый ${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}
