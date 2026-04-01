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
