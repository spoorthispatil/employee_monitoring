import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';

import pool from './db/pool';
import { registerEventHandlers } from './shared/events/bus';
import { runWeeklyScoring, runAWOLCheck, runExpiryCheck } from './shared/jobs/scoring';
import { runPortHourWarningCheck } from './shared/jobs/monitors';

import authRoutes from './modules/hr/auth.routes';
import hrRoutes   from './modules/hr/hr.routes';
import salesRoutes from './modules/sales/sales.routes';
import paperworkRoutes from './modules/paperwork/paperwork.routes';
import {
  logisticsRouter,
  financeRouter,
  procurementRouter,
  manufacturingRouter,
} from './modules/shared.routes';

const app  = express();
const PORT = process.env.PORT || 3001

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded documents (contracts, SGS reports, certs, etc.)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
}));

if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.use('/api/auth',          authRoutes);
app.use('/api/hr',            hrRoutes);
app.use('/api/sales',         salesRoutes);
app.use('/api/logistics',     logisticsRouter);
app.use('/api/finance',       financeRouter);
app.use('/api/procurement',   procurementRouter);
app.use('/api/manufacturing', manufacturingRouter);
app.use('/api/paperwork',     paperworkRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Cron jobs
cron.schedule('0 23 * * 0', async () => {
  console.log('[Cron] Weekly scoring triggered');
  await runWeeklyScoring().catch(console.error);
});
cron.schedule('0 9 * * *', async () => {
  console.log('[Cron] AWOL check triggered');
  await runAWOLCheck().catch(console.error);
});
cron.schedule('0 8 * * *', async () => {
  console.log('[Cron] Expiry check triggered');
  await runExpiryCheck().catch(console.error);
});
cron.schedule('*/15 * * * *', async () => {
  await runPortHourWarningCheck().catch(console.error);
});

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('[DB] Connected to PostgreSQL');
    await registerEventHandlers();
    app.listen(PORT, () => {
      console.log(`[Server] SteelOps API running on port ${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV}`);
    });
  } catch (err) {
    console.error('[Startup] Failed:', err);
    process.exit(1);
  }
}

start();
export default app;
