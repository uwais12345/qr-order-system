import http from 'http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';

const app = createApp();
const server = http.createServer(app);

server.listen(env.PORT, () => {
  logger.info(`🚀 ServeQR Backend running on http://localhost:${env.PORT}${env.API_PREFIX}`);
});

export { app, server };
