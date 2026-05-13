import type { AuthProject } from '../../hooks/useAuth.ts';

export interface PendingProjectCreation {
  firstPrompt?: string;
  createEmptyChart?: boolean;
  groupId?: string;
  templatePublicationId?: string;
  initialProjectName?: string;
  title?: string;
  description?: string;
  archiveProjectId?: string;
  archiveProjectName?: string;
}

export const FREE_ARCHIVED_PROJECT_LIMIT = 4;

export function mergeProjectsForLimitEvaluation(projects: AuthProject[], currentProject: AuthProject | null): AuthProject[] {
  if (!currentProject) {
    return projects;
  }

  const existingIndex = projects.findIndex((project) => project.id === currentProject.id);
  if (existingIndex === -1) {
    return [...projects, currentProject];
  }

  return projects.map((project) => (project.id === currentProject.id ? { ...project, ...currentProject } : project));
}
