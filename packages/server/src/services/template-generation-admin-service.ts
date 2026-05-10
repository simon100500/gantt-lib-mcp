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

type PromptTask = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  parentId?: string;
  type?: 'task' | 'milestone';
  sortOrder?: number;
  dependencies?: Array<{
    taskId: string;
    type: 'FS' | 'SS' | 'FF' | 'SF';
    lag: number;
  }>;
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

function toSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function normalizeTemplateSubject(description: string): string {
  const compact = description.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return 'планирования проекта';
  }

  const withoutLead = compact
    .replace(/^создай\s+график\s+/i, '')
    .replace(/^сделай\s+график\s+/i, '')
    .replace(/^построй\s+график\s+/i, '')
    .replace(/^создай\s+план\s+/i, '')
    .trim();

  const firstPart = withoutLead.split(':')[0]?.trim() ?? withoutLead;
  const cleaned = firstPart.replace(/[.?!]+$/, '').trim();
  return cleaned ? cleaned.toLowerCase() : 'планирования проекта';
}

function summarizeTaskGraph(tasks: PromptTask[]): string {
  if (tasks.length === 0) {
    return 'График работ не передан.';
  }

  const sortedTasks = [...tasks].sort((left, right) => {
    const leftOrder = left.sortOrder ?? 0;
    const rightOrder = right.sortOrder ?? 0;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.name.localeCompare(right.name, 'ru');
  });

  const childrenByParent = new Map<string, PromptTask[]>();
  for (const task of sortedTasks) {
    if (!task.parentId) {
      continue;
    }
    const bucket = childrenByParent.get(task.parentId) ?? [];
    bucket.push(task);
    childrenByParent.set(task.parentId, bucket);
  }

  const roots = sortedTasks.filter((task) => !task.parentId);
  const milestones = sortedTasks.filter((task) => task.type === 'milestone');
  const lines: string[] = [
    `Всего задач: ${sortedTasks.length}`,
    `Корневых этапов: ${roots.length}`,
    'Структура графика:',
  ];

  for (const root of roots.slice(0, 12)) {
    const children = (childrenByParent.get(root.id) ?? []).slice(0, 6);
    lines.push(`- ${root.name}`);
    if (children.length > 0) {
      lines.push(`  Подэтапы: ${children.map((child) => child.name).join('; ')}`);
    }
  }

  if (milestones.length > 0) {
    lines.push(`Контрольные точки: ${milestones.slice(0, 8).map((task) => task.name).join('; ')}`);
  }

  const dependencyExamples = sortedTasks
    .flatMap((task) => (task.dependencies ?? []).map((dependency) => ({
      fromTaskId: dependency.taskId,
      toTaskName: task.name,
      type: dependency.type,
      lag: dependency.lag,
    })))
    .slice(0, 12)
    .map((dependency) => {
      const source = sortedTasks.find((task) => task.id === dependency.fromTaskId);
      return source
        ? `${source.name} -> ${dependency.toTaskName} (${dependency.type}${dependency.lag ? `, lag ${dependency.lag}` : ''})`
        : null;
    })
    .filter((value): value is string => Boolean(value));

  if (dependencyExamples.length > 0) {
    lines.push(`Примеры зависимостей: ${dependencyExamples.join('; ')}`);
  }

  return lines.join('\n');
}

function toPromptTasks(tasks: Array<{
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  parentId?: string;
  type?: 'task' | 'milestone';
  sortOrder?: number;
  dependencies?: Array<{
    taskId: string;
    type: 'FS' | 'SS' | 'FF' | 'SF';
    lag?: number;
  }>;
}>): PromptTask[] {
  return tasks.map((task) => ({
    id: task.id,
    name: task.name,
    startDate: task.startDate,
    endDate: task.endDate,
    parentId: task.parentId,
    type: task.type,
    sortOrder: task.sortOrder,
    dependencies: task.dependencies?.map((dependency) => ({
      taskId: dependency.taskId,
      type: dependency.type,
      lag: dependency.lag ?? 0,
    })),
  }));
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
  const subject = normalizeTemplateSubject(input.description);
  const titleText = toSentenceCase(title);
  return {
    title: titleText,
    slug: slugify(title) || `template-${Date.now()}`,
    summary: `Готовый шаблон графика работ для ${subject}. Его можно взять за основу, адаптировать под свой объект и использовать для планирования этапов, сроков и зависимостей.`,
    category: trimToNull(input.category) ?? null,
    industry: trimToNull(input.industry) ?? null,
    seoTitle: titleText,
    seoDescription: `Шаблон графика работ для ${subject}: этапы реализации, дедлайны, зависимости задач и контрольные точки в ГетГант.`,
    seoBody: [
      '## Что это за шаблон',
      `Шаблон графика работ для ${subject} — это готовая структура проекта в формате диаграммы Ганта. Его можно использовать как основу для своего плана, адаптировать под реальные сроки и состав работ.`,
      `В шаблоне уже заложена типовая логика этапов, поэтому не нужно начинать с пустого листа. Проще проверить последовательность работ, скорректировать задачи под объект и быстро собрать рабочий график.`,
      '',
      '## Кому подойдет шаблон',
      'Такой шаблон можно использовать заказчику, прорабу, подрядчику или руководителю проекта, когда нужен понятный базовый план с этапами, сроками и зависимостями.',
      '',
      '## Как использовать шаблон',
      '- откройте готовый график;',
      '- проверьте этапы и задачи;',
      '- скорректируйте сроки под свой объект;',
      '- добавьте или удалите нужные работы;',
      '- уточните зависимости и контрольные точки;',
      '',
      '## Если шаблон не подошел',
      `Если готовый вариант не подходит под ваш объект, создайте свой график с помощью ИИ. Опишите ${subject} обычными словами, и ГетГант предложит индивидуальный план работ с задачами, сроками и зависимостями.`,
    ].join('\n\n'),
    tags: [],
  };
}

async function generateMetadataDraft(input: {
  description: string;
  kind: TemplatePublicationKind;
  category?: string;
  industry?: string;
  taskGraphSummary?: string;
}): Promise<MetadataDraft> {
  const env = resolveModelEnv();
  if (!env.OPENAI_API_KEY) {
    return fallbackMetadata(input);
  }

  try {
    const response = await completeTextPrompt({
      env,
      maxTokens: 2200,
      prompt: [
        'Напиши описание шаблона для страницы ГетГант.',
        'Страница должна продавать готовый шаблон. AI-генерация — вторичный сценарий: если шаблон не подошел, пользователь может создать свой.',
        'Главный смысл страницы: перед пользователем уже есть готовый график-шаблон. Его можно взять за основу, адаптировать под свой объект и использовать для планирования работ.',
        'Твоя задача: подготовить metadata и SEO-текст для страницы шаблона графика работ в ГетГант.',
        'Верни только JSON без пояснений, без markdown code fences и без любого текста вне JSON.',
        'JSON schema:',
        '{"title":"string","slug":"string","summary":"string","category":"string|null","industry":"string|null","seoTitle":"string","seoDescription":"string","seoBody":"string","tags":["string"]}',
        '',
        'Тема шаблона:',
        input.description.trim(),
        '',
        'Задача текста: сделать его понятным, живым и полезным для пользователя.',
        'Текст должен звучать как объяснение от опытного project manager / прораба / маркетолога, который помогает быстро разобраться, как пользоваться шаблоном.',
        'Не пиши чопорно, канцелярски или слишком технически.',
        '',
        'Требования к полям:',
        '- title: короткий и понятный заголовок шаблона.',
        '- slug: латиницей, seo-friendly.',
        '- summary: это leading text под H1. 2 плотных предложения или 2 коротких абзаца о том, что это готовый шаблон и как его использовать как основу.',
        '- seoTitle: заголовок для search snippet.',
        '- seoDescription: короткое meta description до 160-180 символов.',
        '- tags: массив из 3-8 релевантных тегов.',
        '- seoBody: обязательно в Markdown, не HTML.',
        '',
        'Требования к seoBody:',
        '- не используй заголовок H1;',
        '- используй только заголовки ## и ###;',
        '- текст должен быть готов к последующему рендерингу из Markdown в HTML;',
        '- используй маркированные списки через "- " там, где нужен список;',
        '- объем: примерно 350-700 слов;',
        '- допускается **жирный** акцент внутри строк, но без перегруза;',
        '- не выдумывай факты, которых нет в исходных данных;',
        '- пиши так, будто на странице уже есть leading text под H1, затем график, затем основной SEO-текст с блоками;',
        '- если ниже передан реальный график работ, опирайся именно на него, а не на абстрактный тип проекта;',
        '- называй в тексте реальные блоки работ и реальные переходы между этапами из графика, если они видны во входных данных;',
        '- не упоминай календарные даты, месяцы, годы, диапазоны дат и конкретный период проекта;',
        '- не пиши формулировки вида "с ... по ...", даже если они угадываются по графику;',
        '- считай все сроки в графике относительными: можно говорить о последовательности, длительности, параллельности и этапах, но не о конкретных датах;',
        '',
        'Текст должен отвечать на 5 вопросов:',
        '1. Что это за шаблон?',
        '2. Для чего он нужен?',
        '3. Кому он подходит?',
        '4. Какой состав и логика работ уже заложены в шаблоне?',
        '5. Как его использовать?',
        '',
        'Структура seoBody:',
        '## Что это за шаблон',
        'Ровно 2 абзаца основного SEO-текста.',
        'В этом блоке объясни, что это готовый шаблон, для чего он нужен, как помогает видеть последовательность работ и почему его удобно взять за основу вместо пустого листа.',
        'Скажи, что шаблон можно адаптировать под объект: менять сроки, длительность задач, состав работ и зависимости.',
        '',
        '## Кому подойдет шаблон',
        'Короткий вводный абзац и затем список аудиторий: заказчик, прораб, подрядчик, дизайнер, руководитель проекта и другие, только если это уместно для типа шаблона.',
        '',
        '## Как использовать шаблон',
        'Короткий вводный абзац и затем список шагов: открыть, проверить этапы, скорректировать сроки, добавить или удалить задачи, уточнить зависимости и контрольные точки.',
        '',
        '## Если шаблон не подошел',
        '1-2 коротких абзаца про вторичный сценарий: если готовый шаблон не подходит, можно создать свой график с помощью ИИ.',
        'Заверши мягким CTA в стиле: "Создать свой график с ИИ".',
        '',
        'Стиль:',
        '- писать простым русским языком;',
        '- предложения короткие и средние;',
        '- без канцелярита;',
        '- без перегруза профессиональными терминами;',
        '- не повторять одни и те же слова слишком часто;',
        '- не использовать сухие фразы вроде "данный шаблон предназначен";',
        '- не писать "осуществлять", "производить", "реализация мероприятий", "в рамках проекта";',
        '- писать конкретно, с примерами;',
        '- сохранять экспертность, но без тяжелого тона;',
        '- не обещать идеальный результат, а говорить о пользе шаблона как о хорошей стартовой основе;',
        '- главный акцент: это готовый шаблон, который уже можно использовать;',
        '- AI — вторичный сценарий, а не главный смысл страницы;',
        '',
        'SEO:',
        'Естественно используй ключевые слова, но не спамь:',
        '- график работ;',
        '- диаграмма Ганта;',
        '- этапы;',
        '- сроки;',
        '- зависимости;',
        '- контрольные точки;',
        '- шаблон;',
        '- ГетГант;',
        '',
        'Важно:',
        '- текст должен быть готов для публикации на лендинге шаблона;',
        '- не пиши объяснения о том, как ты писал текст;',
        '- не добавляй список рекомендаций;',
        '- сразу выдай готовое описание в указанной структуре;',
        '',
        'Дополнительные ограничения:',
        '- не добавляй H1 внутрь seoBody;',
        '- не превращай первый блок в длинную простыню текста;',
        '- текст должен быть привязан к конкретному составу графика; упоминай реальные этапы вроде демонтажа, электрики, сантехники, стяжки, штукатурки, плитки, чистовой отделки, мебели только если они реально есть в переданном графике;',
        '- не называй шаблон "универсальным" и не описывай процесс слишком широко, если график узкий и прикладной;',
        '- не превращай текст в отчет по графику: нужен живой прикладной SEO-текст, а не перечисление всех операций подряд;',
        '- если это шаблон строительства, ремонта, монтажа или производства, используй профильную лексику уместно;',
        '- не пиши, что редактирование доступно после входа: это уже сообщает интерфейс страницы.',
        `kind: ${input.kind}`,
        `requestedCategory: ${input.category ?? ''}`,
        `requestedIndustry: ${input.industry ?? ''}`,
        '',
        'Реальный график работ:',
        input.taskGraphSummary?.trim() || 'График работ не передан.',
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

    const initialMetadata = fallbackMetadata({
      description,
      kind: input.kind,
      category: input.category,
      industry: input.industry,
    });

    const startedJob = await (prisma as any).templateGenerationJob.update({
      where: { id: queuedJob.id },
      data: {
        status: 'in_progress',
        title: initialMetadata.title,
        slug: initialMetadata.slug,
        lastRunAt: new Date(),
        errorMessage: null,
      },
    }) as TemplateGenerationJobRecord;

    try {
      const sourceProject = await projectService.create(
        input.requestedByUserId,
        `Source — ${initialMetadata.title}`,
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
        broadcastToSession: () => { },
      });

      if (!generation.ok) {
        throw new Error(generation.assistantResponse);
      }

      const generatedTasks = await taskService.listAll(sourceProject.id);
      const metadata = await generateMetadataDraft({
        description,
        kind: input.kind,
        category: input.category,
        industry: input.industry,
        taskGraphSummary: summarizeTaskGraph(toPromptTasks(generatedTasks)),
      });

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
      taskGraphSummary: summarizeTaskGraph(toPromptTasks(publication.snapshot.tasks)),
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
