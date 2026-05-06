import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireCurrentProjectEditor } from '../access-control.js';
import { requireActiveSubscriptionForMutation } from '../middleware/constraint-middleware.js';
import {
  buildExcelImportPreview,
  buildExcelImportTemplateBuffer,
  commitExcelImport,
  ExcelImportValidationError,
} from '../excel-import.js';

type ExcelImportRequestBody = {
  fileName?: string;
  fileBase64?: string;
  hierarchyMode?: 'auto' | 'wbs_level';
  mapping?: Record<string, { columnIndex?: number | null; enabled?: boolean }>;
};

function sanitizeFileName(input: string): string {
  const sanitized = input.replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim();
  return sanitized.length > 0 ? sanitized : 'template';
}

function isExcelImportValidationError(error: unknown): error is ExcelImportValidationError {
  return error instanceof ExcelImportValidationError || (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'validation_error'
    && 'issues' in error
  );
}

function parseImportBody(body: unknown): ExcelImportRequestBody {
  if (!body || typeof body !== 'object') {
    return {};
  }
  return body as ExcelImportRequestBody;
}

export async function registerExcelImportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/import/excel/preview', { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const body = parseImportBody(req.body);
    if (!body.fileName || !body.fileBase64) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'fileName and fileBase64 are required',
      });
    }

    try {
      const response = await buildExcelImportPreview({
        fileName: body.fileName,
        fileBase64: body.fileBase64,
        mapping: body.mapping,
        hierarchyMode: body.hierarchyMode,
      });
      return reply.send(response);
    } catch (error) {
      if (isExcelImportValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issues: error.issues,
        });
      }
      throw error;
    }
  });

  fastify.post('/api/import/excel/commit', { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const body = parseImportBody(req.body);
    if (!body.fileName || !body.fileBase64) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'fileName and fileBase64 are required',
      });
    }

    try {
      const response = await commitExcelImport({
        projectId: req.user!.projectId,
        userId: req.user!.userId,
        fileName: body.fileName,
        fileBase64: body.fileBase64,
        mapping: body.mapping,
        hierarchyMode: body.hierarchyMode,
      });
      return reply.send(response);
    } catch (error) {
      if (isExcelImportValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issues: error.issues,
        });
      }
      throw error;
    }
  });

  fastify.get('/api/import/excel/template', { preHandler: [authMiddleware] }, async (_req, reply) => {
    const buffer = await buildExcelImportTemplateBuffer();
    const fileName = `${sanitizeFileName('Шаблон импорта задач')} - GetGantt.xlsx`;

    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
      .send(buffer);
  });
}
