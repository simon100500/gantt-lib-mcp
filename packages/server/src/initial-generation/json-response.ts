function isEscaped(value: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findBalancedJsonEnd(payload: string, startIndex: number): number {
  let depth = 0;
  let inString = false;

  for (let index = startIndex; index < payload.length; index += 1) {
    const char = payload[index]!;

    if (char === '"' && !isEscaped(payload, index)) {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{' || char === '[') {
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

export function parseModelJson(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    const startIndex = payload.search(/[{\[]/);
    if (startIndex < 0) {
      throw new Error(`Planner response does not contain JSON; preview=${payload.slice(0, 240)}`);
    }

    const endIndex = findBalancedJsonEnd(payload, startIndex);
    if (endIndex < 0) {
      throw new Error(`Planner response contains unterminated JSON; preview=${payload.slice(startIndex, startIndex + 240)}`);
    }

    const candidate = payload.slice(startIndex, endIndex + 1);
    try {
      return JSON.parse(candidate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Planner response JSON extraction failed: ${message}; preview=${candidate.slice(0, 240)}`);
    }
  }
}
