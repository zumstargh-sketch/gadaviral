import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app is deployed under https://www.gadaviral.com/app/ — base MUST stay '/app/'.
// The backend is the WordPress GADAVIRAL REST API at
// https://www.gadaviral.com/wp-json/gadaviral/v1/ — same origin as the app in
// production, so production needs no proxy and no CORS handling.
//
// Local development (`npm run dev`) proxies /wp-json to the STAGING WordPress
// API (the subdirectory install at https://gadaviral.com/staging) so the local
// UI at http://localhost:5173/app/ talks to staging data through its own
// origin (no CORS). Production never touches this proxy.
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/wp-json': { target: 'https://gadaviral.com/staging', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});

