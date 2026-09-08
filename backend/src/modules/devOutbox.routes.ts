import { Router } from 'express';
import { sql } from '../db/client.js';
import { asyncHandler } from '../utils/http.js';
import { config } from '../config.js';

/**
 * DEV MAILBOX — available only while SMTP dev mode is active on a
 * non-production server. When SMTP is not configured, auth emails
 * (verification link + OTP, password reset, …) are stored in the
 * outbox_emails table instead of being sent; this endpoint surfaces them so
 * registration/login can be tested end-to-end without a mail server.
 * It returns 404 in production or when real SMTP is configured.
 */
const router = Router();

router.get('/outbox', asyncHandler(async (req, res) => {
  if (config.isProd || !config.smtp.devMode) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  }
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : null;
  const rows = email
    ? await sql`SELECT to_email, subject, template, status, html, created_at FROM outbox_emails WHERE to_email = ${email} ORDER BY created_at DESC LIMIT 10`
    : await sql`SELECT to_email, subject, template, status, html, created_at FROM outbox_emails ORDER BY created_at DESC LIMIT 25`;
  res.json({
    devMailbox: true,
    count: rows.length,
    emails: (rows as any[]).map((r) => ({
      to: r.to_email,
      subject: r.subject,
      template: r.template,
      status: r.status,
      createdAt: r.created_at,
      otp: (String(r.html ?? '').match(/\b(\d{6})\b/) ?? [])[1] ?? null,
      linkToken: (String(r.html ?? '').match(/token=([A-Za-z0-9_\-]+)/) ?? [])[1] ?? null,
    })),
  });
}));

export default router;