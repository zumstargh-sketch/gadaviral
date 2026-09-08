import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { initSockets } from './services/sockets.js';
import { sql } from './db/client.js';

const app = createApp();
const server = http.createServer(app);
initSockets(server);

// Bind to all interfaces (required on Render/PaaS where PORT is injected).
const host = '0.0.0.0';
server.listen(config.port, host, () => {
  console.log(`[gadaviral] API listening on http://${host}:${config.port} (env: ${config.env})`);
  console.log(`[gadaviral] docs: /api/docs  health: /api/v1/health`);
});

async function shutdown() {
  console.log('\n[gadaviral] shutting down…');
  server.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
