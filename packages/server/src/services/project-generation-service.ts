import { getPrisma } from '@gantt/runtime-core/prisma';

export type ProjectGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
export type ProjectGenerationJobStage =
  | 'queued'
  | 'interpreting'
  | 'planning'
  | 'compiling'
  | 'committing'
  | 'finalizing'
  | 'succeeded'
  | 'failed';
export type ProjectGenerationPreviewMode = 'none' | 'ephemeral' | 'persisted';

export type ProjectGenerationJobRecord = {
  id: string;
  projectId: string | null;
  intentId: string | null;
  userId: string;
  source: string;
  type: string;
  status: ProjectGenerationJobStatus;
  stage: ProjectGenerationJobStage;
  statusMessage: string | null;
  requestContextId: string | null;
  historyGroupId: string | null;
  progressPercent: number | null;
  previewMode: ProjectGenerationPreviewMode;
  previewAvailable: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectGenerationJobView = {
  id: string;
  projectId: string | null;
  intentId: string | null;
  userId: string;
  source: string;
  type: string;
  status: ProjectGenerationJobStatus;
  stage: ProjectGenerationJobStage;
  statusMessage: string | null;
  requestContextId: string | null;
  historyGroupId: string | null;
  progressPercent: number | null;
  previewMode: ProjectGenerationPreviewMode;
  previewAvailable: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type StartProjectGenerationJobInput = {
  projectId: string;
  intentId?: string | null;
  userId: string;
  source: string;
  type: string;
  requestContextId?: string | null;
  historyGroupId?: string | null;
  previewMode?: ProjectGenerationPreviewMode;
};

type ProjectGenerationJobLifecyclePatch = {
  stage?: ProjectGenerationJobStage;
  status?: ProjectGenerationJobStatus;
  statusMessage?: string | null;
  progressPercent?: number | null;
  previewMode?: ProjectGenerationPreviewMode;
  previewAvailable?: boolean;
  requestContextId?: string | null;
  historyGroupId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

const ACTIVE_PROJECT_GENERATION_JOB_STATUSES: ProjectGenerationJobStatus[] = ['queued', 'running'];

function toIsoStringOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function normalizeView(job: ProjectGenerationJobRecord): ProjectGenerationJobView {
  return {
    ...job,
    startedAt: toIsoStringOrNull(job.startedAt),
    finishedAt: toIsoStringOrNull(job.finishedAt),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function getProjectGenerationJobModel() {
  return (getPrisma() as any).projectGenerationJob;
}

export function serializeProjectGenerationJob(job: ProjectGenerationJobRecord): ProjectGenerationJobView {
  return normalizeView(job);
}

export async function getProjectGenerationJobById(jobId: string): Promise<ProjectGenerationJobRecord | null> {
  return await getProjectGenerationJobModel().findUnique({
    where: { id: jobId },
  }) as ProjectGenerationJobRecord | null;
}

export async function findActiveProjectGenerationJobForProject(projectId: string): Promise<ProjectGenerationJobRecord | null> {
  return await getProjectGenerationJobModel().findFirst({
    where: {
      projectId,
      status: { in: ACTIVE_PROJECT_GENERATION_JOB_STATUSES },
    },
    orderBy: { createdAt: 'desc' },
  }) as ProjectGenerationJobRecord | null;
}

export async function findLatestProjectGenerationJobForProject(projectId: string): Promise<ProjectGenerationJobRecord | null> {
  return await getProjectGenerationJobModel().findFirst({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  }) as ProjectGenerationJobRecord | null;
}

export async function findLatestProjectGenerationJobForIntent(intentId: string): Promise<ProjectGenerationJobRecord | null> {
  return await getProjectGenerationJobModel().findFirst({
    where: { intentId },
    orderBy: { createdAt: 'desc' },
  }) as ProjectGenerationJobRecord | null;
}

export async function startProjectGenerationJob(input: StartProjectGenerationJobInput): Promise<{
  job: ProjectGenerationJobRecord;
  reused: boolean;
}> {
  const existingJob = input.intentId
    ? await getProjectGenerationJobModel().findFirst({
        where: {
          intentId: input.intentId,
          projectId: input.projectId,
          type: input.type,
          status: { in: ACTIVE_PROJECT_GENERATION_JOB_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
      })
    : await getProjectGenerationJobModel().findFirst({
        where: {
          projectId: input.projectId,
          type: input.type,
          status: { in: ACTIVE_PROJECT_GENERATION_JOB_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
      });

  if (existingJob) {
    return {
      job: existingJob as ProjectGenerationJobRecord,
      reused: true,
    };
  }

  const job = await getProjectGenerationJobModel().create({
    data: {
      projectId: input.projectId,
      intentId: input.intentId ?? null,
      userId: input.userId,
      source: input.source,
      type: input.type,
      status: 'queued',
      stage: 'queued',
      requestContextId: input.requestContextId ?? null,
      historyGroupId: input.historyGroupId ?? null,
      previewMode: input.previewMode ?? 'ephemeral',
      previewAvailable: false,
    },
  }) as ProjectGenerationJobRecord;

  return { job, reused: false };
}

export async function updateProjectGenerationJob(jobId: string, patch: ProjectGenerationJobLifecyclePatch): Promise<ProjectGenerationJobRecord> {
  const data: Record<string, unknown> = {};

  if (patch.stage !== undefined) {
    data.stage = patch.stage;
  }
  if (patch.status !== undefined) {
    data.status = patch.status;
  }
  if (patch.statusMessage !== undefined) {
    data.statusMessage = patch.statusMessage;
  }
  if (patch.progressPercent !== undefined) {
    data.progressPercent = patch.progressPercent;
  }
  if (patch.previewMode !== undefined) {
    data.previewMode = patch.previewMode;
  }
  if (patch.previewAvailable !== undefined) {
    data.previewAvailable = patch.previewAvailable;
  }
  if (patch.requestContextId !== undefined) {
    data.requestContextId = patch.requestContextId;
  }
  if (patch.historyGroupId !== undefined) {
    data.historyGroupId = patch.historyGroupId;
  }
  if (patch.errorCode !== undefined) {
    data.errorCode = patch.errorCode;
  }
  if (patch.errorMessage !== undefined) {
    data.errorMessage = patch.errorMessage;
  }
  if (patch.startedAt !== undefined) {
    data.startedAt = patch.startedAt;
  }
  if (patch.finishedAt !== undefined) {
    data.finishedAt = patch.finishedAt;
  }

  return await getProjectGenerationJobModel().update({
    where: { id: jobId },
    data,
  }) as ProjectGenerationJobRecord;
}

export async function markProjectGenerationJobRunning(
  jobId: string,
  stage: ProjectGenerationJobStage,
  statusMessage: string,
): Promise<ProjectGenerationJobRecord> {
  return await updateProjectGenerationJob(jobId, {
    status: 'running',
    stage,
    statusMessage,
    startedAt: new Date(),
  });
}

export async function markProjectGenerationJobPreviewAvailable(jobId: string): Promise<ProjectGenerationJobRecord> {
  return await updateProjectGenerationJob(jobId, {
    previewAvailable: true,
    previewMode: 'ephemeral',
  });
}

export async function markProjectGenerationJobSucceeded(
  jobId: string,
  input?: {
    requestContextId?: string | null;
    historyGroupId?: string | null;
    statusMessage?: string | null;
  },
): Promise<ProjectGenerationJobRecord> {
  return await updateProjectGenerationJob(jobId, {
    status: 'succeeded',
    stage: 'succeeded',
    statusMessage: input?.statusMessage ?? 'График готов',
    requestContextId: input?.requestContextId,
    historyGroupId: input?.historyGroupId,
    finishedAt: new Date(),
    errorCode: null,
    errorMessage: null,
  });
}

export async function markProjectGenerationJobFailed(
  jobId: string,
  input: {
    statusMessage?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): Promise<ProjectGenerationJobRecord> {
  return await updateProjectGenerationJob(jobId, {
    status: 'failed',
    stage: 'failed',
    statusMessage: input.statusMessage ?? 'Генерация завершилась ошибкой',
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    finishedAt: new Date(),
  });
}
