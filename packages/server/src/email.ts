/**
 * Email service for sending OTP codes
 *
 * Uses nodemailer for SMTP delivery. Falls back to console logging
 * when EMAIL_HOST is not configured (useful for development).
 */

import nodemailer from 'nodemailer';

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
  const emailHost = process.env.EMAIL_HOST;

  // Development fallback: log OTP to console
  if (!emailHost) {
    console.log(`[DEV] OTP for ${email}: ${code}`);
    return;
  }

  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  if (!emailUser || !emailPass) {
    throw new Error('EMAIL_USER and EMAIL_PASS are required when EMAIL_HOST is configured');
  }

  const emailPort = Number(process.env.EMAIL_PORT ?? '587');
  const emailSecure = process.env.EMAIL_SECURE === 'true' || emailPort === 465;

  // Production: send real email via SMTP
  const transporter = nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailSecure,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  const fromAddress = process.env.EMAIL_FROM ?? 'Gantt App <noreply@example.com>';

  await transporter.verify();

  await transporter.sendMail({
    from: fromAddress,
    to: email,
    subject: 'Код входа в ГетГант',
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
