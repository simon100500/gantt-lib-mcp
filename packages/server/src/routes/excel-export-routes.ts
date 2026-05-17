import type { FastifyInstance } from 'fastify';
import { BillingService } from '../services/billing-service.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { buildProjectExcelExportBuffer, loadProjectExcelExportData, type ProjectExcelExportMode } from '../excel-export.js';
import { loadGroupGanttOverview, type GroupGanttOverviewPayload, type GroupGanttSectionOverview } from './group-gantt-routes.js';

const billingService = new BillingService();

function sanitizeFileName(input: string): string {
  const sanitized = input.replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim();
  return sanitized.length > 0 ? sanitized : 'project';
}

function toAsciiFileName(input: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return ascii.length > 0 ? ascii : 'project.xlsx';
}

function buildExportTimestamp(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}-${minutes}`;
}

const GROUP_OVERVIEW_PARENT_COLOR = '#6B778C';

function buildGroupOverviewExcelExportData(
  overview: GroupGanttOverviewPayload,
  loadDepth: 1 | 2 | 3,
) {
  let sortOrder = 0;
  const tasks: Array<{
    id: string;
    name: string;
    parentId: string | null;
    startDate: string;
    endDate: string;
    sortOrder: number;
    color: string | null;
    progress?: number;
    dependencies: [];
  }> = [];

  const visitSections = (
    projectId: string,
    sections: GroupGanttSectionOverview[],
    parentId: string,
    depth: 2 | 3,
  ) => {
    for (const section of sections) {
      if (!section.startDate || !section.endDate) {
        continue;
      }

      const taskId = `section:${projectId}:${section.taskId}`;
      const hasChildren = depth === 2 && loadDepth === 3 && (section.children?.length ?? 0) > 0;
      sortOrder += 1;
      tasks.push({
        id: taskId,
        name: section.name,
        parentId,
        startDate: section.startDate,
        endDate: section.endDate,
        sortOrder,
        color: hasChildren ? GROUP_OVERVIEW_PARENT_COLOR : section.color,
        progress: section.progress,
        dependencies: [],
      });

      if (depth < loadDepth) {
        visitSections(projectId, section.children ?? [], taskId, 3);
      }
    }
  };

  for (const project of overview.projects) {
    if (!project.startDate || !project.endDate) {
      continue;
    }

    const projectTaskId = `project:${project.id}`;
    sortOrder += 1;
    tasks.push({
      id: projectTaskId,
      name: project.name,
      parentId: null,
      startDate: project.startDate,
      endDate: project.endDate,
      sortOrder,
      color: null,
      progress: project.progress,
      dependencies: [],
    });

    if (loadDepth >= 2) {
      visitSections(project.id, project.sections, projectTaskId, 2);
    }
  }

  return {
    projectName: `${overview.group.name} - Сводный график`,
    ganttDayMode: 'calendar' as const,
    calendarWeeklyPattern: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true },
    calendarDays: [],
    tasks,
  };
}

export async function registerExcelExportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: { mode?: ProjectExcelExportMode } }>('/api/export/excel', { preHandler: [authMiddleware] }, async (req, reply) => {
    const status = await billingService.getSubscriptionStatus(req.user!.userId);

    if (!status.isActive && status.plan !== 'free') {
      return reply.status(403).send({
        code: 'SUBSCRIPTION_EXPIRED',
        limitKey: null,
        reasonCode: 'subscription_expired',
        remaining: null,
        plan: status.plan,
        planLabel: status.planMeta.label,
        upgradeHint: 'Renew your plan to continue using exports.',
      });
    }

    const exportLimit = status.limits.export;
    if (exportLimit !== 'pdf_excel' && exportLimit !== 'pdf_excel_api') {
      return reply.status(403).send({
        code: 'EXPORT_FEATURE_LOCKED',
        limitKey: 'export',
        reasonCode: 'feature_disabled',
        remaining: null,
        plan: status.plan,
        planLabel: status.planMeta.label,
        upgradeHint: 'Экспорт PDF + Excel доступен на любом платном тарифе.',
      });
    }

    const data = await loadProjectExcelExportData(req.user!.projectId);
    const mode = req.query.mode === 'plan-fact' ? 'plan-fact' : 'gantt';
    const buffer = await buildProjectExcelExportBuffer(data, { mode });
    const fileName = mode === 'plan-fact'
      ? `${sanitizeFileName(data.projectName)}. План-факт. ${buildExportTimestamp(new Date())}.xlsx`
      : `${sanitizeFileName(data.projectName)} - ${buildExportTimestamp(new Date())}.xlsx`;
    const asciiFileName = toAsciiFileName(fileName);
    const encodedFileName = encodeURIComponent(fileName);

    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`)
      .send(buffer);
  });

  fastify.get<{ Params: { groupId: string }; Querystring: { loadDepth?: '1' | '2' | '3' } }>(
    '/api/project-groups/:groupId/overview-gantt/export/excel',
    { preHandler: [authMiddleware] },
    async (req, reply) => {
      const status = await billingService.getSubscriptionStatus(req.user!.userId);

      if (!status.isActive && status.plan !== 'free') {
        return reply.status(403).send({
          code: 'SUBSCRIPTION_EXPIRED',
          limitKey: null,
          reasonCode: 'subscription_expired',
          remaining: null,
          plan: status.plan,
          planLabel: status.planMeta.label,
          upgradeHint: 'Renew your plan to continue using exports.',
        });
      }

      const exportLimit = status.limits.export;
      if (exportLimit !== 'pdf_excel' && exportLimit !== 'pdf_excel_api') {
        return reply.status(403).send({
          code: 'EXPORT_FEATURE_LOCKED',
          limitKey: 'export',
          reasonCode: 'feature_disabled',
          remaining: null,
          plan: status.plan,
          planLabel: status.planMeta.label,
          upgradeHint: 'Экспорт PDF + Excel доступен на любом платном тарифе.',
        });
      }

      const groupId = req.params.groupId?.trim();
      if (!groupId) {
        return reply.status(400).send({ error: 'groupId required' });
      }

      const overview = await loadGroupGanttOverview(req.user!.userId, groupId);
      if (overview.kind === 'forbidden') {
        return reply.status(403).send({ error: 'Project group access denied' });
      }
      if (overview.kind === 'hidden') {
        return reply.status(403).send({ error: 'Project group schedule is hidden for this user' });
      }
      if (overview.kind === 'not_found') {
        return reply.status(404).send({ error: 'Project group not found' });
      }

      const loadDepth = req.query.loadDepth === '1'
        ? 1
        : req.query.loadDepth === '2'
          ? 2
          : 3;
      const data = buildGroupOverviewExcelExportData(overview.payload, loadDepth);
      const buffer = await buildProjectExcelExportBuffer(data, { mode: 'gantt' });
      const fileName = `${sanitizeFileName(data.projectName)} - ${buildExportTimestamp(new Date())}.xlsx`;
      const asciiFileName = toAsciiFileName(fileName);
      const encodedFileName = encodeURIComponent(fileName);

      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`)
        .send(buffer);
    },
  );
}
