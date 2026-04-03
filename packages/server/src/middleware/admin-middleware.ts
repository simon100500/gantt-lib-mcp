import type { FastifyReply, FastifyRequest } from 'fastify';

function parseAdminEmails(): string[] {
  const raw = [process.env.ADMIN_EMAILS, process.env.ADMIN_EMAIL]
    .filter(Boolean)
    .join(',');

  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const adminEmails = parseAdminEmails();
  if (adminEmails.length === 0) {
    return false;
  }

  return adminEmails.includes(email.trim().toLowerCase());
}

export async function requireAdminAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const adminEmails = parseAdminEmails();

  if (adminEmails.length === 0) {
    reply.status(403).send({ error: 'Admin access is not configured' });
    return;
  }

  if (!isAdminEmail(request.user?.email)) {
    reply.status(403).send({ error: 'Admin access required' });
  }
}
