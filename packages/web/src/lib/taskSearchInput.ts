export function extractTaskNames(rawValue: string): string[] {
  return rawValue
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function isMultilineTaskInput(rawValue: string): boolean {
  return rawValue.includes('\n') || rawValue.includes('\r');
}
