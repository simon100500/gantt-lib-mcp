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

  // Production: send real email via SMTP
  const transporter = nodemailer.createTransport({
    host: emailHost,
    port: Number(process.env.EMAIL_PORT ?? '587'),
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const fromAddress = process.env.EMAIL_FROM ?? 'Gantt App <noreply@example.com>';

  await transporter.sendMail({
    from: fromAddress,
    to: email,
    subject: 'Your Gantt login code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Your Gantt Login Code</h2>
        <p style="font-size: 18px; color: #666;">
          Enter this code to sign in to your Gantt account:
        </p>
        <div style="background: #f4f4f4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #333;">
            ${code}
          </span>
        </div>
        <p style="font-size: 14px; color: #999;">
          This code expires in 10 minutes. If you didn't request this, please ignore this email.
        </p>
      </div>
    `,
  });
}
