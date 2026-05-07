import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireCurrentProjectEditor } from '../access-control.js';
import { requireActiveSubscriptionForMutation } from '../middleware/constraint-middleware.js';
import {
  buildGrandSmetaImportPreview,
  commitGrandSmetaImport,
  GrandSmetaImportValidationError,
} from '../grand-smeta-import.js';

type GrandSmetaImportRequestBody = {
  fileName?: string;
  fileBase64?: string;
  options?: {
    includeMaterials?: boolean;
    includeMechanisms?: boolean;
  };
};

function isValidationError(error: unknown): error is GrandSmetaImportValidationError {
  return error instanceof GrandSmetaImportValidationError || (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'validation_error'
    && 'issues' in error
  );
}

function parseImportBody(body: unknown): GrandSmetaImportRequestBody {
  if (!body || typeof body !== 'object') {
    return {};
  }
  return body as GrandSmetaImportRequestBody;
}

export async function registerGrandSmetaImportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/import/grandsmeta/preview', { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const body = parseImportBody(req.body);
    if (!body.fileName || !body.fileBase64) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'fileName and fileBase64 are required',
      });
    }

    try {
      const response = await buildGrandSmetaImportPreview({
        fileName: body.fileName,
        fileBase64: body.fileBase64,
        options: body.options,
      });
      return reply.send(response);
    } catch (error) {
      if (isValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issues: error.issues,
        });
      }
      throw error;
    }
  });

  fastify.post('/api/import/grandsmeta/commit', { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const body = parseImportBody(req.body);
    if (!body.fileName || !body.fileBase64) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'fileName and fileBase64 are required',
      });
    }

    try {
      const response = await commitGrandSmetaImport({
        projectId: req.user!.projectId,
        userId: req.user!.userId,
        fileName: body.fileName,
        fileBase64: body.fileBase64,
        options: body.options,
      });
      return reply.send(response);
    } catch (error) {
      if (isValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issues: error.issues,
        });
      }
      throw error;
    }
  });
}
