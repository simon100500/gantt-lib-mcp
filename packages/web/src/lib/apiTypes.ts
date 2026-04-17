import type { AuthProject, AuthUser } from '../stores/useAuthStore.ts';
import type { ProjectDependency, Task } from '../types.ts';

export interface AuthSuccessResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  project: AuthProject;
}

export interface ProjectLoadResponse {
  version: number;
  project: AuthProject;
  snapshot: {
    tasks: Task[];
    dependencies: ProjectDependency[];
  };
}

export interface HistoryItem {
  id: string;
  actorType: 'user' | 'agent' | 'system';
  title: string;
  status: 'applied' | 'undone';
  baseVersion: number;
  newVersion: number | null;
  commandCount: number;
  createdAt: string;
  undoable: boolean;
  redoable: boolean;
}

export interface HistoryListResponse {
  items: HistoryItem[];
  nextCursor?: string;
}

export interface HistoryMutationResponse {
  groupId: string;
  version: number;
  snapshot: ProjectLoadResponse['snapshot'];
  historyTitle: string;
  status: 'applied' | 'undone';
}
