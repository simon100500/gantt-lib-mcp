import { useEffect, useState } from 'react';
import type { Task } from '../types.ts';

interface SharedProject {
  id: string;
  name: string;
}

interface ShareResponse {
  project: SharedProject;
  tasks: Task[];
}

export interface UseSharedProjectResult {
  shareToken: string | null;
  isSharedReadOnly: boolean;
  project: SharedProject | null;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  loading: boolean;
  error: string | null;
}

export function useSharedProject(): UseSharedProjectResult {
  const [shareToken] = useState(() => new URLSearchParams(window.location.search).get('share'));
  const [project, setProject] = useState<SharedProject | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(Boolean(shareToken));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/share?token=${encodeURIComponent(shareToken)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        return res.json() as Promise<ShareResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setProject(data.project);
        setTasks(data.tasks);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  return {
    shareToken,
    isSharedReadOnly: Boolean(shareToken && project),
    project,
    tasks,
    setTasks,
    loading,
    error,
  };
}
