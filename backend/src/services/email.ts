import nodemailer, { type Transporter } from 'nodemailer';
import { sql } from '../db/client.js';
import { config } from '../config.js';

let transporter: Transporter | null = null;
function getTransport(): Transporter | null {
  if (!config.smtp.configured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.password },
    });
  }
  return transporter;
}

export interface MailResult { devLogged: boolean; }

export async function sendMail(to: string, subject: string, html: string, template: string): Promise<MailResult> {
  const transport = getTransport();
  if (!transport) {
    if (!config.smtp.devMode) throw new Error('SMTP is not configured and dev mode is disabled');
    await sql`INSERT INTO outbox_emails (to_email, subject, template, html, status, sent_at)
              VALUES (${to}, ${subject}, ${template}, ${html}, 'DEV_LOGGED', now())`;
    if (!config.isTest) console.log(`[mail:dev] to=${to} subject="${subject}"`);
    return { devLogged: true };
  }
  try {
    await transport.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to,
      subject,
      html,
    });
    await sql`INSERT INTO outbox_emails (to_email, subject, template, html, status, sent_at)
              VALUES (${to}, ${subject}, ${template}, ${html}, 'SENT', now())`;
    return { devLogged: false };
  } catch (err: any) {
    await sql`INSERT INTO outbox_emails (to_email, subject, template, html, status, error)
              VALUES (${to}, ${subject}, ${template}, ${html}, 'FAILED', ${String(err?.message ?? err)})`;
    throw err;
  }
}
