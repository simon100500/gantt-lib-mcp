import { randomUUID } from 'node:crypto';
import { getPrisma } from '@gantt/runtime-core/prisma';
import {
  commandService,
  getProjectScheduleOptionsForProject,
  messageService,
  projectService,
  taskService,
  templatePublicationService,
} from '@gantt/mcp/services';
import type {
  TemplateGenerationJobItem,
  TemplatePublicationItem,
  TemplatePublicationKind,
  TemplatePublicationVerificationStatus,
  TemplatePublicationVisibility,
} from '@gantt/mcp/types';
import { runInitialGeneration } from '../initial-generation/orchestrator.js';
import { completeTextPrompt } from '../agent/pi-model.js';
import { writeServerDebugLog } from '../debug-log.js';

type TemplateGenerationJobRecord = {
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
  status: TemplateGenerationJobItem['status'];
  seoTitle: string | null;
  seoDescription: string | null;
  seoBody: string | null;
  errorMessage: string | null;
  lastRunAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CreateTemplateGenerationJobInput = {
  requestedByUserId: string;
  description: string;
  kind: TemplatePublicationKind;
  category?: string;
  industry?: string;
  autoPublish?: boolean;
  groupId?: string;
};

type PublishTemplateGenerationJobInput = {
  jobId: string;
  visibility?: TemplatePublicationVisibility;
  verificationStatus?: TemplatePublicationVerificationStatus;
};

type TemplateGenerationSourceItem = {
  projectId: string;
  projectName: string;
  projectStatus: 'active' | 'archived' | 'deleted';
  sourceDescription: string;
  latestJobId: string;
  latestJobStatus: TemplateGenerationJobItem['status'];
  publicationCount: number;
  createdAt: string;
  updatedAt: string;
};

type MetadataDraft = {
  title: string;
  slug: string;
  summary: string;
  category: string | null;
  industry: string | null;
  seoTitle: string;
  seoDescription: string;
  seoBody: string;
  tags: string[];
};

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function mapJob(record: TemplateGenerationJobRecord): TemplateGenerationJobItem {
  return {
    id: record.id,
    requestedByUserId: record.requestedByUserId,
    sourceProjectId: record.sourceProjectId,
    publicationId: record.publicationId,
    sourceDescription: record.sourceDescription,
    kind: record.kind,
    category: record.category,
    industry: record.industry,
    title: record.title,
    slug: record.slug,
    autoPublish: record.autoPublish,
    status: record.status,
    seoTitle: record.seoTitle,
    seoDescription: record.seoDescription,
    seoBody: record.seoBody,
    errorMessage: record.errorMessage,
    lastRunAt: record.lastRunAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function resolveModelEnv() {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '',
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'glm-4.7',
  };
}

function extractJsonObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Model response did not contain JSON');
  }
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
}

function fallbackMetadata(input: {
  description: string;
  kind: TemplatePublicationKind;
  category?: string;
  industry?: string;
}): MetadataDraft {
  const firstSentence = input.description
    .replace(/\s+/g, ' ')
    .trim()
    .split(/[.!?]/)[0]
    ?.trim() ?? 'Шаблон проекта';
  const title = firstSentence.slice(0, 80) || (input.kind === 'block' ? 'Новый блок работ' : 'Новый шаблон проекта');
  return {
    title,
    slug: slugify(title) || `template-${Date.now()}`,
    summary: `Черновик публикации создан по описанию: ${input.description.trim().slice(0, 220)}`,
    category: trimToNull(input.category) ?? null,
    industry: trimToNull(input.industry) ?? null,
    seoTitle: title,
    seoDescription: `Шаблон графика: ${title}`,
    seoBody: [
      `${title} — черновик публикации, автоматически созданный из админ-пайплайна.`,
      'Проверьте структуру source project, описание публикации и SEO-поля перед финальной публикацией.',
    ].join('\n\n'),
    tags: [],
  };
}

async function generateMetadataDraft(input: {
  description: string;
  kind: TemplatePublicationKind;
  category?: string;
  industry?: string;
}): Promise<MetadataDraft> {
  const env = resolveModelEnv();
  if (!env.OPENAI_API_KEY) {
    return fallbackMetadata(input);
  }

  try {
    const response = await completeTextPrompt({
      env,
      maxTokens: 1200,
      prompt: [
        'Ты готовишь metadata и SEO draft для публикации шаблона проекта в GetGantt.',
        'Верни только JSON без пояснений.',
        'JSON schema:',
        '{"title":"string","slug":"string","summary":"string","category":"string|null","industry":"string|null","seoTitle":"string","seoDescription":"string","seoBody":"string","tags":["string"]}',
        `kind: ${input.kind}`,
        `requestedCategory: ${input.category ?? ''}`,
        `requestedIndustry: ${input.industry ?? ''}`,
        'description:',
        input.description.trim(),
      ].join('\n'),
    });
    const parsed = extractJsonObject(response);
    const fallback = fallbackMetadata(input);
    return {
      title: trimToNull(parsed.title as string) ?? fallback.title,
      slug: slugify(trimToNull(parsed.slug as string) ?? trimToNull(parsed.title as string) ?? fallback.slug) || fallback.slug,
      summary: trimToNull(parsed.summary as string) ?? fallback.summary,
      category: trimToNull(parsed.category as string) ?? fallback.category,
      industry: trimToNull(parsed.industry as string) ?? fallback.industry,
      seoTitle: trimToNull(parsed.seoTitle as string) ?? fallback.seoTitle,
      seoDescription: trimToNull(parsed.seoDescription as string) ?? fallback.seoDescription,
      seoBody: trimToNull(parsed.seoBody as string) ?? fallback.seoBody,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean).slice(0, 12)
        : fallback.tags,
    };
  } catch {
    return fallbackMetadata(input);
  }
}

export class TemplateGenerationAdminService {
  async listJobs(): Promise<TemplateGenerationJobItem[]> {
    const prisma = getPrisma();
    const records = await (prisma as any).templateGenerationJob.findMany({
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    }) as TemplateGenerationJobRecord[];
    return records.map(mapJob);
  }

  async listSources(): Promise<TemplateGenerationSourceItem[]> {
    const prisma = getPrisma();
    const jobs = await (prisma as any).templateGenerationJob.findMany({
      where: { sourceProjectId: { not: null } },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    }) as TemplateGenerationJobRecord[];
    const projectIds = Array.from(new Set(jobs.map((job) => job.sourceProjectId).filter((value): value is string => Boolean(value))));
    if (projectIds.length === 0) {
      return [];
    }

    const [projects, publications] = await Promise.all([
      prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          deletedAt: true,
        },
      }),
      (prisma as any).templatePublication.findMany({
        where: { sourceProjectId: { in: projectIds } },
        select: { id: true, sourceProjectId: true },
      }) as Promise<Array<{ id: string; sourceProjectId: string }>>,
    ]);

    const latestJobByProjectId = new Map<string, TemplateGenerationJobRecord>();
    for (const job of jobs) {
      if (job.sourceProjectId && !latestJobByProjectId.has(job.sourceProjectId)) {
        latestJobByProjectId.set(job.sourceProjectId, job);
      }
    }

    const publicationCountByProjectId = new Map<string, number>();
    for (const publication of publications) {
      publicationCountByProjectId.set(
        publication.sourceProjectId,
        (publicationCountByProjectId.get(publication.sourceProjectId) ?? 0) + 1,
      );
    }

    return projects
      .map((project) => {
        const latestJob = latestJobByProjectId.get(project.id);
        if (!latestJob) {
          return null;
        }
        return {
          projectId: project.id,
          projectName: project.name,
          projectStatus: (project.deletedAt ? 'deleted' : project.status) as 'active' | 'archived' | 'deleted',
          sourceDescription: latestJob.sourceDescription,
          latestJobId: latestJob.id,
          latestJobStatus: latestJob.status,
          publicationCount: publicationCountByProjectId.get(project.id) ?? 0,
          createdAt: project.createdAt.toISOString(),
          updatedAt: latestJob.updatedAt.toISOString(),
        };
      })
      .filter((item): item is TemplateGenerationSourceItem => Boolean(item))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async listPublications(): Promise<TemplatePublicationItem[]> {
    const response = await templatePublicationService.listPublications({ includeNonPublic: true });
    return response.publications;
  }

  async createJobFromDescription(input: CreateTemplateGenerationJobInput): Promise<{
    job: TemplateGenerationJobItem;
    publication: TemplatePublicationItem | null;
  }> {
    const prisma = getPrisma();
    const description = input.description.trim();
    if (!description) {
      throw new Error('description is required');
    }

    const queuedJob = await (prisma as any).templateGenerationJob.create({
      data: {
        id: randomUUID(),
        requestedByUserId: input.requestedByUserId,
        sourceDescription: description,
        kind: input.kind,
        category: trimToNull(input.category),
        industry: trimToNull(input.industry),
        autoPublish: input.autoPublish === true,
        status: 'queued',
      },
    }) as TemplateGenerationJobRecord;

    const metadata = await generateMetadataDraft({
      description,
      kind: input.kind,
      category: input.category,
      industry: input.industry,
    });

    const startedJob = await (prisma as any).templateGenerationJob.update({
      where: { id: queuedJob.id },
      data: {
        status: 'in_progress',
        title: metadata.title,
        slug: metadata.slug,
        lastRunAt: new Date(),
        errorMessage: null,
      },
    }) as TemplateGenerationJobRecord;

    try {
      const sourceProject = await projectService.create(
        input.requestedByUserId,
        `Source — ${metadata.title}`,
        input.groupId,
      );

      await (prisma as any).templateGenerationJob.update({
        where: { id: queuedJob.id },
        data: { sourceProjectId: sourceProject.id },
      });

      await messageService.add('user', description, sourceProject.id, {
        requestContextId: queuedJob.id,
      });

      const scheduleOptions = await getProjectScheduleOptionsForProject(prisma, sourceProject.id);
      const generation = await runInitialGeneration({
        projectId: sourceProject.id,
        sessionId: queuedJob.id,
        runId: queuedJob.id,
        userMessage: description,
        tasksBefore: [],
        baseVersion: 0,
        scheduleOptions,
        interpretationModel: resolveModelEnv().OPENAI_MODEL,
        interpretationQuery: async ({ prompt, model }) => ({ content: await completeTextPrompt({ env: { ...resolveModelEnv(), OPENAI_MODEL: model }, prompt }) }),
        plannerQuery: async ({ prompt, model, onTextDelta }) => ({ content: await completeTextPrompt({ env: { ...resolveModelEnv(), OPENAI_MODEL: model }, prompt, onTextDelta }) }),
        services: {
          commandService,
          messageService,
          taskService,
        },
        logger: {
          debug: (event, payload) => writeServerDebugLog(event, payload),
        },
        broadcastToSession: () => {},
      });

      if (!generation.ok) {
        throw new Error(generation.assistantResponse);
      }

      const createdPublication = await templatePublicationService.createFromProject({
        sourceUserId: input.requestedByUserId,
        projectId: sourceProject.id,
        kind: input.kind,
        title: metadata.title,
        slug: metadata.slug,
        summary: metadata.summary,
        category: metadata.category ?? undefined,
        industry: metadata.industry ?? undefined,
        tags: metadata.tags,
        status: 'draft',
        visibility: 'private',
        verificationStatus: 'reviewed',
        seoTitle: metadata.seoTitle,
        seoDescription: metadata.seoDescription,
        seoBody: metadata.seoBody,
      });

      let finalPublication = createdPublication;
      let finalStatus: TemplateGenerationJobItem['status'] = input.autoPublish ? 'published' : 'ready_to_publish';
      if (input.autoPublish) {
        finalPublication = await templatePublicationService.updatePublication({
          publicationId: createdPublication.id,
          status: 'published',
          visibility: 'both',
          verificationStatus: 'editorial',
        });
      }

      const finishedJob = await (prisma as any).templateGenerationJob.update({
        where: { id: queuedJob.id },
        data: {
          publicationId: finalPublication.id,
          title: finalPublication.title,
          slug: finalPublication.slug,
          seoTitle: metadata.seoTitle,
          seoDescription: metadata.seoDescription,
          seoBody: metadata.seoBody,
          status: finalStatus,
          completedAt: new Date(),
        },
      }) as TemplateGenerationJobRecord;

      return {
        job: mapJob(finishedJob),
        publication: finalPublication,
      };
    } catch (error) {
      const failedJob = await (prisma as any).templateGenerationJob.update({
        where: { id: queuedJob.id },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        },
      }) as TemplateGenerationJobRecord;

      return {
        job: mapJob(failedJob),
        publication: null,
      };
    } finally {
      await writeServerDebugLog('template_generation_job_completed', {
        jobId: queuedJob.id,
        requestedByUserId: input.requestedByUserId,
        sourceProjectId: startedJob.sourceProjectId,
      });
    }
  }

  async publishJob(input: PublishTemplateGenerationJobInput): Promise<{
    job: TemplateGenerationJobItem;
    publication: TemplatePublicationItem;
  }> {
    const prisma = getPrisma();
    const job = await (prisma as any).templateGenerationJob.findUnique({
      where: { id: input.jobId },
    }) as TemplateGenerationJobRecord | null;
    if (!job?.publicationId) {
      throw new Error('Job publication not found');
    }

    const publication = await templatePublicationService.updatePublication({
      publicationId: job.publicationId,
      status: 'published',
      visibility: input.visibility ?? 'both',
      verificationStatus: input.verificationStatus ?? 'editorial',
    });

    const updatedJob = await (prisma as any).templateGenerationJob.update({
      where: { id: input.jobId },
      data: {
        status: 'published',
        publicationId: publication.id,
        title: publication.title,
        slug: publication.slug,
        seoTitle: publication.seoTitle,
        seoDescription: publication.seoDescription,
        seoBody: publication.seoBody,
        completedAt: new Date(),
      },
    }) as TemplateGenerationJobRecord;

    return {
      job: mapJob(updatedJob),
      publication,
    };
  }

  async regenerateSeoDraft(publicationId: string): Promise<TemplatePublicationItem> {
    const prisma = getPrisma();
    const publication = await templatePublicationService.getPublication({ publicationId });
    const fallback = fallbackMetadata({
      description: publication.summary ?? publication.title,
      kind: publication.kind,
      category: publication.category ?? undefined,
      industry: publication.industry ?? undefined,
    });
    const metadata = await generateMetadataDraft({
      description: publication.summary ?? publication.title,
      kind: publication.kind,
      category: publication.category ?? undefined,
      industry: publication.industry ?? undefined,
    });
    const updated = await templatePublicationService.updatePublication({
      publicationId,
      seoTitle: metadata.seoTitle || fallback.seoTitle,
      seoDescription: metadata.seoDescription || fallback.seoDescription,
      seoBody: metadata.seoBody || fallback.seoBody,
    });

    const latestJob = await (prisma as any).templateGenerationJob.findFirst({
      where: { publicationId },
      orderBy: [{ createdAt: 'desc' }],
    }) as TemplateGenerationJobRecord | null;
    if (latestJob) {
      await (prisma as any).templateGenerationJob.update({
        where: { id: latestJob.id },
        data: {
          seoTitle: updated.seoTitle,
          seoDescription: updated.seoDescription,
          seoBody: updated.seoBody,
          status: latestJob.status === 'review_required' ? 'ready_to_publish' : latestJob.status,
        },
      });
    }

    return updated;
  }

  async deleteJob(jobId: string): Promise<{ id: string }> {
    const prisma = getPrisma();
    const deleted = await (prisma as any).templateGenerationJob.delete({
      where: { id: jobId },
      select: { id: true },
    }) as { id: string } | null;
    if (!deleted) {
      throw new Error('Job not found');
    }
    return { id: deleted.id };
  }

  async deletePublication(publicationId: string): Promise<{ id: string }> {
    const prisma = getPrisma();
    const publication = await (prisma as any).templatePublication.findUnique({
      where: { id: publicationId },
      select: { id: true },
    }) as { id: string } | null;
    if (!publication) {
      throw new Error('Publication not found');
    }

    await prisma.$transaction(async (tx) => {
      await (tx as any).templateGenerationJob.updateMany({
        where: {
          publicationId,
          sourceProjectId: { not: null },
        },
        data: {
          publicationId: null,
          status: 'ready_to_publish',
        },
      });

      await (tx as any).templateGenerationJob.updateMany({
        where: {
          publicationId,
          sourceProjectId: null,
        },
        data: {
          publicationId: null,
          status: 'review_required',
        },
      });

      await (tx as any).templatePublication.delete({
        where: { id: publicationId },
      });
    });

    return { id: publicationId };
  }

  async deleteSource(projectId: string): Promise<{ id: string }> {
    const prisma = getPrisma();
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new Error('Source project not found');
    }

    const publications = await (prisma as any).templatePublication.findMany({
      where: { sourceProjectId: projectId },
      select: { id: true },
    }) as Array<{ id: string }>;
    const publicationIds = publications.map((publication) => publication.id);

    await prisma.$transaction(async (tx) => {
      if (publicationIds.length > 0) {
        await (tx as any).templateGenerationJob.updateMany({
          where: { publicationId: { in: publicationIds } },
          data: {
            publicationId: null,
            sourceProjectId: null,
            status: 'review_required',
            errorMessage: 'Source project deleted from admin',
          },
        });
      }

      await (tx as any).templateGenerationJob.updateMany({
        where: { sourceProjectId: projectId },
        data: {
          sourceProjectId: null,
          status: 'review_required',
          errorMessage: 'Source project deleted from admin',
        },
      });

      await tx.project.delete({
        where: { id: projectId },
      });
    });

    return { id: projectId };
  }
}

export const templateGenerationAdminService = new TemplateGenerationAdminService();
