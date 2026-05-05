import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer/index.js';

export interface FeedbackEmailAttachment {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface SendFeedbackEmailInput {
  to: string;
  authorEmail: string;
  subject: string;
  message: string;
  projectName?: string | null;
  pagePath?: string | null;
  attachments?: FeedbackEmailAttachment[];
}

export interface SendProjectGroupInviteEmailInput {
  to: string;
  inviterEmail: string;
  groupName: string;
  role: 'editor' | 'viewer';
  expiresAt: Date;
}

function getEmailConfig() {
  const emailHost = process.env.EMAIL_HOST;
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  const emailPort = Number(process.env.EMAIL_PORT ?? '587');
  const emailSecure = process.env.EMAIL_SECURE === 'true' || emailPort === 465;
  const fromAddress = process.env.EMAIL_FROM ?? 'GetGantt <noreply@example.com>';

  return {
    emailHost,
    emailUser,
    emailPass,
    emailPort,
    emailSecure,
    fromAddress,
  };
}

async function createTransport(): Promise<{ transporter: Mail; fromAddress: string } | null> {
  const config = getEmailConfig();
  if (!config.emailHost) {
    return null;
  }

  if (!config.emailUser || !config.emailPass) {
    throw new Error('EMAIL_USER and EMAIL_PASS are required when EMAIL_HOST is configured');
  }

  const transporter = nodemailer.createTransport({
    host: config.emailHost,
    port: config.emailPort,
    secure: config.emailSecure,
    auth: {
      user: config.emailUser,
      pass: config.emailPass,
    },
  });

  await transporter.verify();
  return {
    transporter,
    fromAddress: config.fromAddress,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Send an OTP code via email
 *
 * In development (when EMAIL_HOST is not set), logs the OTP to console
 * instead of sending an email. This allows testing without SMTP setup.
 *
 * @param email - Recipient email address
 * @param code - 6-digit OTP code to send
 * @throws Error if email sending fails (and EMAIL_HOST is configured)
 */
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const transport = await createTransport();
  if (!transport) {
    console.log(`[DEV] OTP for ${email}: ${code}`);
    return;
  }

  await transport.transporter.sendMail({
    from: transport.fromAddress,
    to: email,
    subject: 'Код для входа',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Ваш код для входа в GetGantt.ru</h2>
        <p style="font-size: 18px; color: #666;">
          Введите этот код, чтобы войти в ваш аккаунт:
        </p>
        <div style="background: #f4f4f4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #333;">
            ${code}
          </span>
        </div>
        <p style="font-size: 14px; color: #999;">
          Код действует 10 минут. Если вы не запрашивали вход, просто проигнорируйте это письмо.
        </p>
      </div>
    `,
  });
}

export async function sendFeedbackEmail(input: SendFeedbackEmailInput): Promise<void> {
  const attachments = input.attachments ?? [];
  const transport = await createTransport();

  if (!transport) {
    console.log('[DEV] Feedback email', {
      to: input.to,
      authorEmail: input.authorEmail,
      subject: input.subject,
      projectName: input.projectName ?? null,
      pagePath: input.pagePath ?? null,
      attachmentNames: attachments.map((attachment) => attachment.fileName),
      messagePreview: input.message.slice(0, 280),
    });
    return;
  }

  const projectLine = input.projectName ? `Проект: ${input.projectName}` : 'Проект: —';
  const pageLine = input.pagePath ? `Страница: ${input.pagePath}` : 'Страница: —';
  const textBody = [
    `Автор: ${input.authorEmail}`,
    projectLine,
    pageLine,
    '',
    input.message,
  ].join('\n');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; color: #0f172a;">
      <h2 style="margin: 0 0 16px;">Обратная связь из GetGantt</h2>
      <p style="margin: 0 0 8px;"><strong>Автор:</strong> ${escapeHtml(input.authorEmail)}</p>
      <p style="margin: 0 0 8px;"><strong>Проект:</strong> ${escapeHtml(input.projectName ?? '—')}</p>
      <p style="margin: 0 0 16px;"><strong>Страница:</strong> ${escapeHtml(input.pagePath ?? '—')}</p>
      <div style="white-space: pre-wrap; line-height: 1.5; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px;">
        ${escapeHtml(input.message)}
      </div>
    </div>
  `;

  await transport.transporter.sendMail({
    from: transport.fromAddress,
    to: input.to,
    cc: input.authorEmail,
    replyTo: input.authorEmail,
    subject: `[GetGantt] ${input.subject}`,
    text: textBody,
    html: htmlBody,
    attachments: attachments.map((attachment) => ({
      filename: attachment.fileName,
      content: Buffer.from(attachment.contentBase64, 'base64'),
      contentType: attachment.mimeType,
    })),
  });
}

export async function sendProjectGroupInviteEmail(input: SendProjectGroupInviteEmailInput): Promise<void> {
  const transport = await createTransport();
  const roleLabel = input.role === 'viewer' ? 'наблюдатель' : 'редактор';
  const expiresAtLabel = input.expiresAt.toLocaleDateString('ru-RU');

  if (!transport) {
    console.log('[DEV] Project group invite email', {
      to: input.to,
      inviterEmail: input.inviterEmail,
      groupName: input.groupName,
      role: input.role,
      expiresAt: input.expiresAt.toISOString(),
    });
    return;
  }

  const textBody = [
    `Вас пригласили в команду группы проектов "${input.groupName}" в GetGantt.`,
    '',
    `Пригласил: ${input.inviterEmail}`,
    `Роль: ${roleLabel}`,
    `Приглашение действует до ${expiresAtLabel}.`,
    '',
    'Просто войдите в GetGantt под этим email, и пространство появится автоматически.',
  ].join('\n');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; color: #0f172a;">
      <h2 style="margin: 0 0 16px;">Приглашение в команду группы проектов</h2>
      <p style="margin: 0 0 8px;">Вас пригласили в <strong>${escapeHtml(input.groupName)}</strong> в GetGantt.</p>
      <p style="margin: 0 0 8px;"><strong>Пригласил:</strong> ${escapeHtml(input.inviterEmail)}</p>
      <p style="margin: 0 0 16px;"><strong>Роль:</strong> ${escapeHtml(roleLabel)}</p>
      <div style="margin: 0 0 16px; border: 1px solid #dbeafe; background: #eff6ff; border-radius: 12px; padding: 16px;">
        <p style="margin: 0; line-height: 1.5; color: #1e3a8a;">
          Просто войдите в GetGantt под этим email, и пространство появится автоматически.
        </p>
      </div>
      <p style="margin: 0; color: #64748b; font-size: 14px;">Приглашение действует до ${escapeHtml(expiresAtLabel)}.</p>
    </div>
  `;

  await transport.transporter.sendMail({
    from: transport.fromAddress,
    to: input.to,
    subject: `[GetGantt] Приглашение в "${input.groupName}"`,
    text: textBody,
    html: htmlBody,
  });
}
