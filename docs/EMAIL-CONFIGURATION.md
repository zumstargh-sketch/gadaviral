# Email Configuration — SMTP, SPF, DKIM, DMARC (spec §18–26)

The official authentication sender is **GADAVIRAL <admin@gadaviral.com>**.

## 1. SMTP environment (backend/.env)

```env
SMTP_HOST=mail.gadaviral.com        # or your provider's SMTP host
SMTP_PORT=587
SMTP_SECURE=false                   # true for port 465
SMTP_USER=admin@gadaviral.com
SMTP_PASSWORD=<real password>
SMTP_FROM_EMAIL=admin@gadaviral.com
SMTP_FROM_NAME=GADAVIRAL
SMTP_DEV_MODE=false                 # true = log to outbox instead of sending (DEV ONLY)
```

> **Note:** hosting-panel (cPanel) credentials are usually the same mailbox
> password, but corporate SMTP providers may require an app-specific password.
> Never assume — verify with the email provider.

With `SMTP_DEV_MODE=true` (default when no host is set), emails are stored in
the `outbox_emails` table and logged to the console instead of being sent —
useful for development and the automated test suite.

Dev convenience: `GET /api/v1/dev/outbox` lists pending auth emails (with the
OTP extracted), and the website's verify screen shows the code automatically.
Both are unavailable (404 / hidden) in production or when real SMTP is set.

## 2. Branded templates (already implemented)

All auth emails use the responsive GADAVIRAL template (renders in Gmail,
Outlook, Yahoo, mobile and desktop clients): black/gold brand header,
clear CTA button, expiry notice, security footer with support contact.

| Template | Contains |
|---|---|
| Verify email | **VERIFY MY EMAIL** button + 6-digit OTP box + expiry |
| Resend verification | same, fresh code |
| Password reset | **RESET MY PASSWORD** button, single-use link |
| Email change | **CONFIRM NEW EMAIL** button |
| Security alert | password-change notification |

## 3. DNS records (domain DNS zone — e.g. Namecheap → Advanced DNS)

**SPF** (TXT `@`):
```
v=spf1 include:spf.migrations_Namecheap_provider_or_your_smtp ~all
```
Example for Namecheap Private Email:
```
v=spf1 include:spf.privateemail.com ~all
```
Only ONE SPF record per domain — merge includes if you have several senders.

**DKIM**: enable in the mail provider (cPanel: Email Deliverability →
"Enable DKIM"), then add the provided `default._domainkey` TXT/CNAME record.

**DMARC** (TXT `_dmarc`):
```
v=DMARC1; p=none; rua=mailto:admin@gadaviral.com; fo=1
```
Start with `p=none`, watch reports, then tighten to `p=quarantine` and later
`p=reject` once SPF/DKIM are confirmed aligned.

## 4. Email security behaviour (implemented)

- Verification: single-use link token (24 h, hashed in DB) + hashed 6-digit OTP
  (10 min, max 5 attempts), both invalidated after use or on resend.
- Resend: 60 s cooldown + rate limit (`/auth/resend-verification`).
- Password reset: single-use 1 h token; existing password never emailed;
  all sessions revoked on reset; security alert email sent.
- Email change: requires current password + ownership proof of the NEW address.
- Anti-enumeration: registration, login and reset respond identically whether
  or not the address exists.
- Login/reset endpoints: strict per-IP rate limiting (brute-force protection).
