import express from 'express';
import cors from 'cors';
import http from 'http';
import { testConnection } from './config/db';
import { testRedisConnection } from './config/redis';
import { broadcaster } from './websocket/broadcaster';
import { startScheduler } from './scheduler/cron';
import dashboardRoutes from './routes/dashboard.routes';
import optionChainRoutes from './routes/optionChain.routes';
import historyRoutes from './routes/history.routes';
import explainRoutes from './routes/explain.routes';

const PORT = parseInt(process.env.PORT || '3001', 10);

async function main() {
  const app = express();

  // Middleware
  app.use(cors({
    origin: function (origin, callback) {
      const allowedOrigins = ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];
      if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);
      if (!origin || allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));
  app.use(express.json());
  // Root route for health check and welcome message
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      message: 'Options Intelligence API is running',
      version: '1.0.0'
    });
  });

  // Routes
  app.use('/api', dashboardRoutes);
  app.use('/api', optionChainRoutes);
  app.use('/api', historyRoutes);
  app.use('/api', explainRoutes);

  // Create HTTP server
  const server = http.createServer(app);

  // Initialize WebSocket
  broadcaster.initialize(server);

  // Test connections
  const dbOk = await testConnection();
  const redisOk = await testRedisConnection();

  if (!dbOk) console.warn('[Server] PostgreSQL not available - running with limited functionality');
  if (!redisOk) console.warn('[Server] Redis not available - running with limited caching');

  // Start scheduler
  startScheduler();

  // Start server
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n================================================`);
    console.log(`  Options Intelligence Platform`);
    console.log(`  API:       http://localhost:${PORT}`);
    console.log(`  WebSocket: ws://localhost:${PORT}`);
    console.log(`  DB:        ${dbOk ? '✅ Connected' : '❌ Not available'}`);
    console.log(`  Redis:     ${redisOk ? '✅ Connected' : '❌ Not available'}`);
    console.log(`================================================\n`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Server] Shutting down gracefully...');
    broadcaster.shutdown();
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});
