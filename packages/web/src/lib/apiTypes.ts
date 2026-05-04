import type { AuthProject, AuthUser } from '../stores/useAuthStore.ts';
import type {
  ProjectDependency,
  PlannerScope,
  ResourceScope,
  ResourceType,
  Task,
  ProjectGroup,
  FinancePeriodGranularity,
  FinancePeriodBucket,
  ProjectFinanceSnapshot,
  TaskFinanceSetting,
  TaskFundingEvent,
  TaskProgressEntry,
} from '../types.ts';

export type {
  PlannerScope,
  ResourcePlannerInterval,
  ResourcePlannerResource,
  ResourcePlannerResult,
  ResourceScope,
  ResourceType,
  ProjectGroup,
  FinancePeriodGranularity,
  FinancePeriodBucket,
  ProjectFinanceSnapshot,
  TaskFinanceSetting,
  TaskFundingEvent,
  TaskProgressEntry,
} from '../types.ts';

export interface ProjectResource {
  id: string;
  userId: string;
  projectId: string | null;
  projectGroupId?: string | null;
  scope: ResourceScope;
  name: string;
  type: ResourceType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
}

export interface TaskAssignmentRecord {
  id: string;
  projectId: string;
  taskId: string;
  resourceId: string;
  createdAt: string;
}

export interface ShareLinkListItem {
  id: string;
  projectId: string;
  label: string;
  scope: 'project' | 'task_selection';
  includedTaskIds: string[];
  previewTitles?: string[];
  revokedAt: string | null;
  createdAt: string;
  url: string;
}

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
    resources: ProjectResource[];
    assignments: TaskAssignmentRecord[];
    progressEntries?: TaskProgressEntry[];
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
  canRedo?: boolean;
  redoGroupId?: string | null;
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

export type BaselineSource = 'current' | 'history';

export interface BaselineItem {
  id: string;
  projectId: string;
  name: string;
  source: BaselineSource;
  sourceHistoryGroupId: string | null;
  createdAt: string;
}

export interface BaselineListResponse {
  baselines: BaselineItem[];
}

export interface BaselineSnapshotResponse extends BaselineItem {
  snapshot: ProjectLoadResponse['snapshot'];
}

export type BaselineCreateResponse = BaselineSnapshotResponse;
export type BaselineUpdateResponse = BaselineSnapshotResponse;

export interface BaselineDeleteResponse {
  id: string;
}

export type TemplateSourceKind = 'project' | 'task_selection';

export interface TemplateItem {
  id: string;
  ownerUserId: string;
  name: string;
  sourceKind: TemplateSourceKind;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
}

export interface TemplateWorkspaceResponse {
  metadata: TemplateItem;
  snapshot: {
    tasks: Task[];
    dependencies: ProjectDependency[];
  };
}
