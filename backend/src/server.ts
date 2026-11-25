import http from 'http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { initRealtime } from './realtime/realtimeEmitter.js';

const app = createApp();
const server = http.createServer(app);
const io = initRealtime(server);

server.listen(env.PORT, () => {
  logger.info(`🚀 ServeQR Backend + Socket.IO running on http://localhost:${env.PORT}${env.API_PREFIX}`);
});

export { app, server, io };
