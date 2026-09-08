import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().default('http://localhost:4000'),
  WEB_APP_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string(),
  DATABASE_SSL: z.string().default('false'),
  DB_POOL_MAX: z.coerce.number().default(20),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(60 * 60 * 24 * 30),
  REFRESH_COOKIE_NAME: z.string().default('gadv_refresh'),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().optional().default(''),
  GOOGLE_ANDROID_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_DESKTOP_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_HD: z.string().optional().default(''),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().default('false'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM_EMAIL: z.string().default('admin@gadaviral.com'),
  SMTP_FROM_NAME: z.string().default('GADAVIRAL'),
  SMTP_DEV_MODE: z.string().default('true'),

  EMAIL_VERIFY_TOKEN_TTL: z.coerce.number().default(86400),
  EMAIL_OTP_TTL: z.coerce.number().default(600),
  EMAIL_OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  EMAIL_RESEND_COOLDOWN: z.coerce.number().default(60),
  PASSWORD_RESET_TOKEN_TTL: z.coerce.number().default(3600),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(20),

  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('storage'),
  STORAGE_PUBLIC_BASE: z.string().default('/media'),
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  ALLOWED_IMAGE_MIME: z.string().default('image/jpeg,image/png,image/webp,image/gif'),
  ALLOWED_VIDEO_MIME: z.string().default('video/mp4,video/webm'),

  FCM_PROJECT_ID: z.string().optional().default(''),
  FCM_CLIENT_EMAIL: z.string().optional().default(''),
  FCM_PRIVATE_KEY: z.string().optional().default(''),
  MODERATION_API_URL: z.string().optional().default(''),
  MODERATION_API_KEY: z.string().optional().default(''),

  SMTP_DEV_CAPTURE: z.string().optional().default(''),
  TEST_OTP_ECHO: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  apiBaseUrl: env.API_BASE_URL.replace(/\/$/, ''),
  webAppUrl: env.WEB_APP_URL.replace(/\/$/, ''),
  corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  databaseUrl: env.DATABASE_URL,
  databaseSsl: env.DATABASE_SSL === 'true',
  dbPoolMax: env.DB_POOL_MAX,

  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
    refreshCookie: env.REFRESH_COOKIE_NAME,
  },

  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackUrl: env.GOOGLE_CALLBACK_URL,
    androidClientId: env.GOOGLE_ANDROID_CLIENT_ID,
    desktopClientId: env.GOOGLE_DESKTOP_CLIENT_ID,
    hd: env.GOOGLE_HD,
    /** All audiences this backend accepts Google ID tokens for. */
    get audiences(): string[] {
      return [env.GOOGLE_CLIENT_ID, env.GOOGLE_ANDROID_CLIENT_ID, env.GOOGLE_DESKTOP_CLIENT_ID]
        .filter(Boolean);
    },
    get configured(): boolean {
      return Boolean(env.GOOGLE_CLIENT_ID);
    },
  },

  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    fromEmail: env.SMTP_FROM_EMAIL,
    fromName: env.SMTP_FROM_NAME,
    devMode: env.SMTP_DEV_MODE === 'true' || !env.SMTP_HOST,
    get configured(): boolean {
      return Boolean(env.SMTP_HOST && env.SMTP_USER);
    },
  },

  emailTokens: {
    verifyTtl: env.EMAIL_VERIFY_TOKEN_TTL,
    otpTtl: env.EMAIL_OTP_TTL,
    otpMaxAttempts: env.EMAIL_OTP_MAX_ATTEMPTS,
    resendCooldown: env.EMAIL_RESEND_COOLDOWN,
    resetTtl: env.PASSWORD_RESET_TOKEN_TTL,
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    authWindowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    authMax: env.AUTH_RATE_LIMIT_MAX,
  },

  storage: {
    driver: env.STORAGE_DRIVER,
    localDir: env.STORAGE_LOCAL_DIR,
    publicBase: env.STORAGE_PUBLIC_BASE,
    maxUploadMb: env.MAX_UPLOAD_MB,
    allowedImageMime: env.ALLOWED_IMAGE_MIME.split(',').map((s) => s.trim()),
    allowedVideoMime: env.ALLOWED_VIDEO_MIME.split(',').map((s) => s.trim()),
  },

  push: {
    fcmProjectId: env.FCM_PROJECT_ID,
    fcmClientEmail: env.FCM_CLIENT_EMAIL,
    fcmPrivateKey: env.FCM_PRIVATE_KEY,
  },

  moderation: {
    apiUrl: env.MODERATION_API_URL,
    apiKey: env.MODERATION_API_KEY,
  },

  /** Test hooks (only honoured when NODE_ENV=test) */
  test: {
    otpEcho: env.TEST_OTP_ECHO === 'true' && env.NODE_ENV === 'test',
  },
};

export type Config = typeof config;
