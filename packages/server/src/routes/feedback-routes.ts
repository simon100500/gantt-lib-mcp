import type { FastifyInstance } from 'fastify';
import { sendFeedbackEmail, type FeedbackEmailAttachment } from '../email.js';
import { authMiddleware } from '../middleware/auth-middleware.js';

const FEEDBACK_RECIPIENT = process.env.FEEDBACK_EMAIL_TO ?? 'ag-id@ya.ru';
const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FeedbackRequestBody {
  message?: string;
  projectName?: string | null;
  pagePath?: string | null;
  attachments?: FeedbackEmailAttachment[];
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeFileName(input: string): string {
  const collapsed = input.replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim();
  return collapsed || 'attachment';
}

function validateAttachments(rawAttachments: unknown): FeedbackEmailAttachment[] {
  if (rawAttachments == null) {
    return [];
  }

  if (!Array.isArray(rawAttachments)) {
    throw new Error('attachments must be an array');
  }

  if (rawAttachments.length > MAX_ATTACHMENTS) {
    throw new Error(`no more than ${MAX_ATTACHMENTS} attachments allowed`);
  }

  let totalBytes = 0;

  return rawAttachments.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`attachment ${index + 1} is invalid`);
    }

    const attachment = item as FeedbackEmailAttachment;
    const fileName = sanitizeFileName(normalizeText(attachment.fileName));
    const mimeType = normalizeText(attachment.mimeType) || 'application/octet-stream';
    const contentBase64 = normalizeText(attachment.contentBase64);

    if (!fileName) {
      throw new Error(`attachment ${index + 1} fileName is required`);
    }

    if (!contentBase64) {
      throw new Error(`attachment ${index + 1} content is required`);
    }

    let byteLength = 0;
    try {
      byteLength = Buffer.byteLength(contentBase64, 'base64');
    } catch {
      throw new Error(`attachment ${index + 1} content is not valid base64`);
    }

    if (byteLength <= 0) {
      throw new Error(`attachment ${index + 1} is empty`);
    }

    if (byteLength > MAX_FILE_BYTES) {
      throw new Error(`attachment ${fileName} exceeds ${MAX_FILE_BYTES} bytes`);
    }

    totalBytes += byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(`attachments exceed ${MAX_TOTAL_BYTES} bytes total`);
    }

    return {
      fileName,
      mimeType,
      contentBase64,
    };
  });
}

export async function registerFeedbackRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/feedback', {
    preHandler: [authMiddleware],
    bodyLimit: 15 * 1024 * 1024,
  }, async (req, reply) => {
    const body = (req.body ?? {}) as FeedbackRequestBody;
    const authorEmail = normalizeText(req.user?.email).toLowerCase();
    const message = normalizeText(body.message);
    const projectName = normalizeText(body.projectName);
    const pagePath = normalizeText(body.pagePath);

    if (!authorEmail || !EMAIL_RE.test(authorEmail)) {
      return reply.status(400).send({ error: 'valid authorEmail required' });
    }

    if (message.length < 10 || message.length > 5000) {
      return reply.status(400).send({ error: 'message must be between 10 and 5000 characters' });
    }

    let attachments: FeedbackEmailAttachment[] = [];
    try {
      attachments = validateAttachments(body.attachments);
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'invalid attachments' });
    }

    try {
      await sendFeedbackEmail({
        to: FEEDBACK_RECIPIENT,
        authorEmail,
        subject: projectName ? `Обратная связь: ${projectName}` : 'Обратная связь',
        message,
        projectName: projectName || null,
        pagePath: pagePath || null,
        attachments,
      });
      return reply.send({ ok: true });
    } catch (error) {
      fastify.log.error(error, 'Failed to send feedback email');
      return reply.status(500).send({ error: 'Failed to send feedback email' });
    }
  });
}
