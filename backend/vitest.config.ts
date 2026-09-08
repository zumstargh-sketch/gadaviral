import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    hookTimeout: 120_000,
    testTimeout: 60_000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:15432/gadaviral_test?client_encoding=UTF8',
      // .env may carry DATABASE_SSL=true (Render PostgreSQL) — tests always run
      // against the local embedded server, which speaks plain postgres only.
      DATABASE_SSL: 'false',
      JWT_ACCESS_SECRET: 'test-secret-gadaviral-0123456789abcdef',
      PORT: '0',
      SMTP_DEV_MODE: 'true',
      TEST_OTP_ECHO: 'false',
    },
  },
});
