export type FactTask = {
  id: string;
  name: string;
  parentId: string | null;
  startDate: string;
  endDate: string;
  type: 'task' | 'milestone';
  status: 'not_started' | 'in_progress' | 'done' | 'closed';
  progress: number;
  workVolume: number | null;
  workUnit: string | null;
  completedVolume: number;
  sortOrder: number;
  isLeaf: boolean;
  writable: boolean;
  dayPlan: number;
  dayFact: number;
  dayFactUpdatedAt: string | null;
  closeState: FactMarkState | null;
  closeInputMode: 'volume' | 'percent' | null;
  closeValue: number | null;
  closeReason: string | null;
  closeComment: string | null;
};

export type FactSession = {
  token: {
    slug: string;
    label: string;
    expiresAt: string | null;
  };
  project: {
    id: string;
    name: string;
    status: string;
  };
  date: string;
  tasks: FactTask[];
};

export type FactMarkState = 'fact' | 'done' | 'not_worked' | 'problem';

export type FactDayCloseEntry = {
  taskId: string;
  state: FactMarkState;
  value?: number;
  inputMode?: 'volume' | 'percent';
  reason?: string;
  comment?: string;
};

const API_BASE_URL = (import.meta.env.VITE_FACT_API_BASE_URL ?? '').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed: ${response.status}`);
  }
  return payload as T;
}

export async function loadFactSession(input: { token: string; date?: string }): Promise<FactSession> {
  const params = new URLSearchParams({ token: input.token });
  if (input.date) {
    params.set('date', input.date);
  }
  return request<FactSession>(`/api/fact/session?${params.toString()}`);
}

export async function closeFactDay(input: {
  token: string;
  date: string;
  entries: FactDayCloseEntry[];
}): Promise<{ ok: true; saved: number; date: string }> {
  return request('/api/fact/day-close', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
