import type { FastifyInstance } from 'fastify';
import { BillingService } from '../services/billing-service.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { buildProjectExcelExportBuffer, loadProjectExcelExportData } from '../excel-export.js';

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

export async function registerExcelExportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/export/excel', { preHandler: [authMiddleware] }, async (req, reply) => {
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
        upgradeHint: 'Экспорт PDF + Excel доступен на тарифе Команда и выше.',
      });
    }

    const data = await loadProjectExcelExportData(req.user!.projectId);
    const buffer = await buildProjectExcelExportBuffer(data);
    const fileName = `${sanitizeFileName(data.projectName)} - ${buildExportTimestamp(new Date())}.xlsx`;
    const asciiFileName = toAsciiFileName(fileName);
    const encodedFileName = encodeURIComponent(fileName);

    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`)
      .send(buffer);
  });
}
