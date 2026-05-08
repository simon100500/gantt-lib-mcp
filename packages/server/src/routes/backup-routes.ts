import type { FastifyInstance } from 'fastify';
import { BillingService } from '../services/billing-service.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireCurrentProjectEditor } from '../access-control.js';
import { requireActiveSubscriptionForMutation } from '../middleware/constraint-middleware.js';
import {
  buildBackupDownloadFileName,
  buildProjectBackup,
  importProjectBackup,
  parseProjectBackupFile,
} from '../project-backup.js';

const billingService = new BillingService();

function toAsciiFileName(input: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return ascii.length > 0 ? ascii : 'project-backup.gantt.json';
}

export async function registerBackupRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/export/backup', { preHandler: [authMiddleware] }, async (req, reply) => {
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
    if (exportLimit === 'none') {
      return reply.status(403).send({
        code: 'EXPORT_FEATURE_LOCKED',
        limitKey: 'export',
        reasonCode: 'feature_disabled',
        remaining: null,
        plan: status.plan,
        planLabel: status.planMeta.label,
        upgradeHint: 'Экспорт backup доступен на любом платном тарифе.',
      });
    }

    const backup = await buildProjectBackup(req.user!.projectId);
    const fileName = buildBackupDownloadFileName(backup.project.name);
    const asciiFileName = toAsciiFileName(fileName);
    const encodedFileName = encodeURIComponent(fileName);

    reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`)
      .send(JSON.stringify(backup, null, 2));
  });

  fastify.post('/api/import/backup', { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const body = req.body as { backup?: unknown } | null | undefined;
    if (!body || body.backup === undefined) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'backup required',
      });
    }

    try {
      const backup = parseProjectBackupFile(body.backup);
      const summary = await importProjectBackup(req.user!.projectId, backup);
      return reply.send({
        ok: true,
        summary,
      });
    } catch (error) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: error instanceof Error ? error.message : 'Invalid backup file',
      });
    }
  });
}
