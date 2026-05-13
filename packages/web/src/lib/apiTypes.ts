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
  userHiddenTaskListColumnsOverride: string[] | null;
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

export type TemplatePublicationKind = 'template' | 'block';
export type TemplatePublicationStatus = 'draft' | 'published' | 'archived' | 'rejected';
export type TemplatePublicationVisibility = 'private' | 'marketplace' | 'site' | 'both';
export type TemplatePublicationVerificationStatus = 'unverified' | 'reviewed' | 'verified' | 'editorial';
export type TemplateGenerationJobStatus = 'queued' | 'in_progress' | 'review_required' | 'ready_to_publish' | 'published' | 'failed';

export interface TemplatePublicationListItem {
  id: string;
  slug: string;
  kind: TemplatePublicationKind;
  sourceProjectId: string;
  sourceUserId: string;
  sourceTemplateId: string | null;
  sourceKind: 'project' | 'task_selection';
  sourceSelectionTaskIds: string[];
  title: string;
  subtitle: string | null;
  summary: string | null;
  category: string | null;
  industry: string | null;
  tags: string[];
  status: TemplatePublicationStatus;
  visibility: TemplatePublicationVisibility;
  verificationStatus: TemplatePublicationVerificationStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  seoBody: string | null;
  coverImageUrl: string | null;
  previewImageUrl: string | null;
  taskCount: number;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplatePublicationDetail extends TemplatePublicationListItem {
  snapshot: {
    tasks: Task[];
    dependencies: ProjectDependency[];
    ganttDayMode: 'business' | 'calendar';
    calendarWeeklyPattern: { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean };
    calendarDays: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }>;
    timelineMarkers: Array<{ date: string; color?: string | null; name?: string | null }>;
  };
}

export interface TemplateGenerationJobListItem {
  id: string;
  requestedByUserId: string;
  sourceProjectId: string | null;
  publicationId: string | null;
  sourceDescription: string;
  kind: TemplatePublicationKind;
  category: string | null;
  industry: string | null;
  title: string | null;
  slug: string | null;
  autoPublish: boolean;
  status: TemplateGenerationJobStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  seoBody: string | null;
  errorMessage: string | null;
  lastRunAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateGenerationSourceListItem {
  projectId: string;
  projectName: string;
  projectStatus: 'active' | 'archived' | 'deleted';
  sourceDescription: string;
  latestJobId: string;
  latestJobStatus: TemplateGenerationJobStatus;
  publicationCount: number;
  createdAt: string;
  updatedAt: string;
}
