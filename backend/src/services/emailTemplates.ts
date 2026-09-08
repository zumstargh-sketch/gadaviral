import { sendMail } from './email.js';
import { config } from '../config.js';

const BRAND_GOLD = '#F2A900';
const BRAND_BLACK = '#0B0B0D';
const BRAND_BLUE = '#1E88E5';

function layout(title: string, bodyHtml: string, footerNote: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr><td style="background:${BRAND_BLACK};padding:24px 32px;">
      <span style="font-size:26px;font-weight:bold;color:${BRAND_GOLD};letter-spacing:1px;">GADA<span style="color:#ffffff;">VIRAL</span></span><br>
      <span style="font-size:12px;color:#9ca3af;">Dangme &amp; Ga Online Social Community</span>
    </td></tr>
    <tr><td style="padding:32px;color:#18181b;font-size:15px;line-height:1.6;">
      ${bodyHtml}
    </td></tr>
    <tr><td style="background:#fafafa;padding:20px 32px;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px;line-height:1.6;">
      ${footerNote}<br><br>
      You are receiving this email because an account action was requested at gadaviral.com.
      If this wasn't you, please ignore this email and consider changing your password.<br><br>
      &copy; GADAVIRAL &middot; Accra, Ghana &middot; <a href="https://www.gadaviral.com" style="color:${BRAND_BLUE};">www.gadaviral.com</a><br>
      Support: <a href="mailto:support@gadaviral.com" style="color:${BRAND_BLUE};">support@gadaviral.com</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td
  style="background:${BRAND_GOLD};border-radius:8px;">
  <a href="${url}" style="display:inline-block;padding:14px 32px;color:#0b0b0d;font-weight:bold;font-size:15px;text-decoration:none;">${label}</a>
  </td></tr></table>`;
}

function otpBox(code: string): string {
  return `<div style="margin:24px 0;padding:18px;text-align:center;background:${BRAND_BLACK};border-radius:10px;">
  <span style="font-size:32px;letter-spacing:10px;color:${BRAND_GOLD};font-weight:bold;">${code}</span></div>`;
}

function expiryNote(seconds: number): string {
  const mins = Math.round(seconds / 60);
  const label = mins >= 60 ? `${Math.round(mins / 60)} hour(s)` : `${mins} minute(s)`;
  return `<p style="color:#71717a;font-size:13px;">This code expires in <strong>${label}</strong> and can be used once.</p>`;
}

export const emails = {
  verifyEmail(to: string, name: string, verifyUrl: string, otp: string, ttl: number) {
    return sendMail(to, 'Verify your GADAVIRAL email', layout('Verify your email',
      `<h2 style="margin-top:0;">Hello ${name},</h2>
       <p>Welcome to <strong>GADAVIRAL</strong> — the online home for Ga and Dangme people worldwide.</p>
       <p>Confirm your email address to activate your account:</p>
       ${button(verifyUrl, 'VERIFY MY EMAIL')}
       <p>Or enter this code in the app:</p>
       ${otpBox(otp)}
       ${expiryNote(ttl)}`,
      'Security notice: never share this code or link with anyone. GADAVIRAL staff will never ask for them.'), 'verify_email');
  },

  resendVerification(to: string, name: string, verifyUrl: string, otp: string, ttl: number) {
    return sendMail(to, 'Your new GADAVIRAL verification code', layout('Verify your email',
      `<h2 style="margin-top:0;">Hello ${name},</h2>
       <p>Here is a fresh verification request for your GADAVIRAL account.</p>
       ${button(verifyUrl, 'VERIFY MY EMAIL')}
       <p>Or enter this code in the app:</p>
       ${otpBox(otp)}
       ${expiryNote(ttl)}`,
      'Security notice: never share this code or link with anyone.'), 'resend_verification');
  },

  passwordReset(to: string, name: string, resetUrl: string, ttl: number) {
    return sendMail(to, 'Reset your GADAVIRAL password', layout('Reset your password',
      `<h2 style="margin-top:0;">Hello ${name},</h2>
       <p>We received a request to reset your GADAVIRAL password.</p>
       ${button(resetUrl, 'RESET MY PASSWORD')}
       ${expiryNote(ttl)}
       <p style="color:#71717a;font-size:13px;">If you didn't request this, you can safely ignore this email — your password will not change.</p>`,
      'Security notice: this link can be used once. Never share it with anyone.'), 'password_reset');
  },

  emailChange(to: string, name: string, confirmUrl: string, newEmail: string, ttl: number) {
    return sendMail(to, 'Confirm your new GADAVIRAL email', layout('Confirm your new email',
      `<h2 style="margin-top:0;">Hello ${name},</h2>
       <p>Confirm the new email address (<strong>${newEmail}</strong>) for your GADAVIRAL account:</p>
       ${button(confirmUrl, 'CONFIRM NEW EMAIL')}
       ${expiryNote(ttl)}`,
      'Security notice: if you did not request this change, please secure your account immediately.'), 'email_change');
  },

  securityAlert(to: string, subjectLine: string, message: string) {
    return sendMail(to, subjectLine, layout('Security alert',
      `<h2 style="margin-top:0;">Security alert</h2><p>${message}</p>
       <p style="color:#71717a;font-size:13px;">If this wasn't you, reset your password immediately.</p>`,
      'Security notice: GADAVIRAL will never ask for your password.'), 'security_alert');
  },
};
