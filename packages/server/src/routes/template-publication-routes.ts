import type { FastifyInstance } from 'fastify';
import { authService, templatePublicationService, TemplatePublicationValidationError } from '@gantt/mcp/services';
import type {
  TemplatePublicationKind,
  TemplatePublicationStatus,
  TemplatePublicationVerificationStatus,
  TemplatePublicationVisibility,
} from '@gantt/mcp/types';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireCurrentProjectEditor, resolveGroupAccess } from '../access-control.js';
import { requireActiveSubscriptionForMutation, requireTrackedLimit } from '../middleware/constraint-middleware.js';
import { isAdminEmail, requireAdminAccess } from '../middleware/admin-middleware.js';

const requireProjectLimit = requireTrackedLimit('projects', {
  code: 'PROJECT_LIMIT_REACHED',
  upgradeHint: 'Upgrade your plan to create another project.',
});

function isValidationError(error: unknown): error is TemplatePublicationValidationError {
  return error instanceof TemplatePublicationValidationError
    || (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === 'validation_error'
    );
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function asKind(value: unknown): TemplatePublicationKind | undefined {
  return value === 'template' || value === 'block' ? value : undefined;
}

function asStatus(value: unknown): TemplatePublicationStatus | undefined {
  return value === 'draft' || value === 'published' || value === 'archived' || value === 'rejected'
    ? value
    : undefined;
}

function asVisibility(value: unknown): TemplatePublicationVisibility | undefined {
  return value === 'private' || value === 'marketplace' || value === 'site' || value === 'both'
    ? value
    : undefined;
}

function asVerification(value: unknown): TemplatePublicationVerificationStatus | undefined {
  return value === 'unverified' || value === 'reviewed' || value === 'verified' || value === 'editorial'
    ? value
    : undefined;
}

function parsePublicationBody(body: unknown) {
  const payload = (body ?? {}) as Record<string, unknown>;
  return {
    kind: asKind(payload.kind),
    title: asNonEmptyString(payload.title),
    slug: asNonEmptyString(payload.slug),
    subtitle: typeof payload.subtitle === 'string' ? payload.subtitle : undefined,
    summary: typeof payload.summary === 'string' ? payload.summary : undefined,
    category: typeof payload.category === 'string' ? payload.category : undefined,
    industry: typeof payload.industry === 'string' ? payload.industry : undefined,
    tags: asStringArray(payload.tags),
    status: asStatus(payload.status),
    visibility: asVisibility(payload.visibility),
    verificationStatus: asVerification(payload.verificationStatus),
    seoTitle: typeof payload.seoTitle === 'string' ? payload.seoTitle : undefined,
    seoDescription: typeof payload.seoDescription === 'string' ? payload.seoDescription : undefined,
    seoBody: typeof payload.seoBody === 'string' ? payload.seoBody : undefined,
    coverImageUrl: typeof payload.coverImageUrl === 'string' ? payload.coverImageUrl : undefined,
    previewImageUrl: typeof payload.previewImageUrl === 'string' ? payload.previewImageUrl : undefined,
  };
}

export async function registerTemplatePublicationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/public/template-publications', async (req, reply) => {
    const query = req.query as {
      kind?: string;
      visibilityTarget?: 'marketplace' | 'site';
      category?: string;
      industry?: string;
      tag?: string;
      query?: string;
    };

    try {
      const response = await templatePublicationService.listPublications({
        kind: asKind(query.kind),
        visibilityTarget: query.visibilityTarget === 'site' ? 'site' : 'marketplace',
        category: asNonEmptyString(query.category),
        industry: asNonEmptyString(query.industry),
        tag: asNonEmptyString(query.tag),
        query: asNonEmptyString(query.query),
      });
      return reply.send(response);
    } catch (error) {
      if (isValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.get('/api/public/template-publications/:slug', async (req, reply) => {
    const slug = asNonEmptyString((req.params as { slug?: string }).slug);
    const visibilityTarget = (req.query as { visibilityTarget?: 'marketplace' | 'site' }).visibilityTarget;
    if (!slug) {
      return reply.status(400).send({ reason: 'validation_error', error: 'slug required' });
    }

    try {
      const response = await templatePublicationService.getPublicationBySlug({
        slug,
        visibilityTarget: visibilityTarget === 'site' ? 'site' : visibilityTarget === 'marketplace' ? 'marketplace' : undefined,
      });
      return reply.send(response);
    } catch (error) {
      if (isValidationError(error)) {
        return reply.status(404).send({ reason: 'not_found', error: error.message });
      }
      throw error;
    }
  });

  fastify.get('/api/template-publications', { preHandler: [authMiddleware] }, async (req, reply) => {
    try {
      const response = await templatePublicationService.listPublications({
        sourceUserId: req.user!.userId,
        includeNonPublic: true,
      });
      return reply.send(response);
    } catch (error) {
      if (isValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.get('/api/template-publications/:publicationId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const publicationId = asNonEmptyString((req.params as { publicationId?: string }).publicationId);
    if (!publicationId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'publicationId required' });
    }

    try {
      const response = await templatePublicationService.getPublication({ publicationId });
      return reply.send(response);
    } catch (error) {
      if (isValidationError(error)) {
        return reply.status(404).send({ reason: 'not_found', error: error.message });
      }
      throw error;
    }
  });

  fastify.post('/api/template-publications/project', { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const body = parsePublicationBody(req.body);
    if (!body.kind || !body.title) {
      return reply.status(400).send({ reason: 'validation_error', error: 'kind and title required' });
    }

    try {
      const response = await templatePublicationService.createFromProject({
        sourceUserId: req.projectAccess?.ownerUserId ?? req.user!.userId,
        projectId: req.user!.projectId,
        kind: body.kind,
        title: body.title,
        slug: body.slug,
        subtitle: body.subtitle,
        summary: body.summary,
        category: body.category,
        industry: body.industry,
        tags: body.tags,
        status: isAdminEmail(req.user!.email) ? body.status : undefined,
        visibility: isAdminEmail(req.user!.email) ? body.visibility : 'marketplace',
        verificationStatus: isAdminEmail(req.user!.email) ? body.verificationStatus : 'unverified',
        seoTitle: body.seoTitle,
        seoDescription: body.seoDescription,
        seoBody: body.seoBody,
        coverImageUrl: body.coverImageUrl,
        previewImageUrl: body.previewImageUrl,
      });
      return reply.status(201).send(response);
    } catch (error) {
      if (isValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.post('/api/template-publications/selection', { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const body = parsePublicationBody(req.body);
    const rootTaskIds = asStringArray((req.body as { rootTaskIds?: unknown } | undefined)?.rootTaskIds);
    if (!body.kind || !body.title || !rootTaskIds?.length) {
      return reply.status(400).send({ reason: 'validation_error', error: 'kind, title, and rootTaskIds required' });
    }

    try {
      const response = await templatePublicationService.createFromSelection({
        sourceUserId: req.projectAccess?.ownerUserId ?? req.user!.userId,
        projectId: req.user!.projectId,
        kind: body.kind,
        title: body.title,
        slug: body.slug,
        subtitle: body.subtitle,
        summary: body.summary,
        category: body.category,
        industry: body.industry,
        tags: body.tags,
        status: isAdminEmail(req.user!.email) ? body.status : undefined,
        visibility: isAdminEmail(req.user!.email) ? body.visibility : 'marketplace',
        verificationStatus: isAdminEmail(req.user!.email) ? body.verificationStatus : 'unverified',
        seoTitle: body.seoTitle,
        seoDescription: body.seoDescription,
        seoBody: body.seoBody,
        coverImageUrl: body.coverImageUrl,
        previewImageUrl: body.previewImageUrl,
        rootTaskIds,
      });
      return reply.status(201).send(response);
    } catch (error) {
      if (isValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.patch('/api/template-publications/:publicationId', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const publicationId = asNonEmptyString((req.params as { publicationId?: string }).publicationId);
    if (!publicationId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'publicationId required' });
    }

    const body = req.body as Record<string, unknown> | undefined;
    try {
      const response = await templatePublicationService.updatePublication({
        publicationId,
        title: typeof body?.title === 'string' ? body.title : undefined,
        slug: typeof body?.slug === 'string' ? body.slug : undefined,
        subtitle: typeof body?.subtitle === 'string' || body?.subtitle === null ? body.subtitle as string | null : undefined,
        summary: typeof body?.summary === 'string' || body?.summary === null ? body.summary as string | null : undefined,
        category: typeof body?.category === 'string' || body?.category === null ? body.category as string | null : undefined,
        industry: typeof body?.industry === 'string' || body?.industry === null ? body.industry as string | null : undefined,
        tags: asStringArray(body?.tags),
        status: asStatus(body?.status),
        visibility: asVisibility(body?.visibility),
        verificationStatus: asVerification(body?.verificationStatus),
        seoTitle: typeof body?.seoTitle === 'string' || body?.seoTitle === null ? body.seoTitle as string | null : undefined,
        seoDescription: typeof body?.seoDescription === 'string' || body?.seoDescription === null ? body.seoDescription as string | null : undefined,
        seoBody: typeof body?.seoBody === 'string' || body?.seoBody === null ? body.seoBody as string | null : undefined,
        coverImageUrl: typeof body?.coverImageUrl === 'string' || body?.coverImageUrl === null ? body.coverImageUrl as string | null : undefined,
        previewImageUrl: typeof body?.previewImageUrl === 'string' || body?.previewImageUrl === null ? body.previewImageUrl as string | null : undefined,
      });
      return reply.send(response);
    } catch (error) {
      if (isValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.post('/api/template-publications/:publicationId/republish', { preHandler: [authMiddleware, requireAdminAccess] }, async (req, reply) => {
    const publicationId = asNonEmptyString((req.params as { publicationId?: string }).publicationId);
    if (!publicationId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'publicationId required' });
    }

    try {
      const response = await templatePublicationService.republish({ publicationId });
      return reply.send(response);
    } catch (error) {
      if (isValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.post('/api/template-publications/:publicationId/create-project', { preHandler: [authMiddleware, requireProjectLimit] }, async (req, reply) => {
    const publicationId = asNonEmptyString((req.params as { publicationId?: string }).publicationId);
    const body = (req.body ?? {}) as { projectName?: unknown; groupId?: unknown };
    if (!publicationId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'publicationId required' });
    }

    if (body.groupId !== undefined && typeof body.groupId !== 'string') {
      return reply.status(400).send({ reason: 'validation_error', error: 'groupId must be a string' });
    }

    if (typeof body.groupId === 'string') {
      const access = await resolveGroupAccess(req.user!.userId, body.groupId);
      if (!access || access.role === 'viewer') {
        return reply.status(403).send({ error: 'Project group editor access required' });
      }
    }

    try {
      const result = await templatePublicationService.createProjectFromPublication({
        publicationId,
        ownerUserId: req.user!.userId,
        groupId: typeof body.groupId === 'string' ? body.groupId : undefined,
        projectName: typeof body.projectName === 'string' ? body.projectName : undefined,
      });

      const project = await authService.findProjectById(result.projectId);
      return reply.status(201).send({
        project,
        command: result.response,
      });
    } catch (error) {
      if (isValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.post('/api/template-publications/:publicationId/insert', { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const publicationId = asNonEmptyString((req.params as { publicationId?: string }).publicationId);
    const body = (req.body ?? {}) as { anchorTaskId?: unknown; placement?: unknown };
    if (!publicationId || typeof body.anchorTaskId !== 'string' || !body.anchorTaskId.trim()) {
      return reply.status(400).send({ reason: 'validation_error', error: 'publicationId and anchorTaskId required' });
    }

    try {
      const response = await templatePublicationService.insertIntoProject({
        publicationId,
        projectId: req.user!.projectId,
        anchorTaskId: body.anchorTaskId.trim(),
        placement: body.placement === 'inside' ? 'inside' : 'after',
      }, 'user', req.user!.userId);

      if (response.accepted) {
        return reply.send(response);
      }

      const statusCode = response.reason === 'version_conflict' ? 409 : 400;
      return reply.status(statusCode).send(response);
    } catch (error) {
      if (isValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });
}
