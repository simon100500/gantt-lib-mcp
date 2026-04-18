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
  actorType: 'user' | 'agent' | 'system' | 'import';
  title: string;
  createdAt: string;
  baseVersion: number;
  newVersion: number;
  commandCount: number;
  isCurrent: boolean;
  canRestore: boolean;
}

export interface HistoryListResponse {
  items: HistoryItem[];
  nextCursor?: string;
}

export interface HistorySnapshotResponse {
  groupId: string;
  isCurrent: boolean;
  currentVersion: number;
  snapshot: ProjectLoadResponse['snapshot'];
}

export interface HistoryRestoreResponse {
  groupId: string;
  targetGroupId: string;
  version: number;
  snapshot: ProjectLoadResponse['snapshot'];
  chatCleanup?: {
    deletedCount: number;
    deletedFromMessageId: string | null;
  };
}
