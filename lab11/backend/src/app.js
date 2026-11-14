import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from './db/pool.js';
import { createAuthRoutes } from './routes/authRoutes.js';
import { createCategoryRoutes } from './routes/categoryRoutes.js';
import { createExpenseRoutes } from './routes/expenseRoutes.js';
import { createStatisticsRoutes } from './routes/statisticsRoutes.js';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

export const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
if (process.env.CORS_ORIGIN) app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map(value => value.trim()) }));
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) { next(error); }
});
app.use('/api/auth', createAuthRoutes(pool, jwtSecret));
app.use('/api/categories', createCategoryRoutes(pool, jwtSecret));
app.use('/api/expenses', createExpenseRoutes(pool, jwtSecret));
app.use('/api/statistics', createStatisticsRoutes(pool, jwtSecret));

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(currentDir, '../../frontend/dist');
if (fs.existsSync(frontendDist)) app.use(express.static(frontendDist));
app.get('*splat', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const builtIndex = path.join(frontendDist, 'index.html');
  if (fs.existsSync(builtIndex)) return res.sendFile(builtIndex);
  if (req.path === '/') return res.redirect('http://localhost:5173');
  next();
});

app.use((req, res) => res.status(404).json({ error: 'Маршрут не найден' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  const status = Number(error.status) || 500;
  res.status(status).json({ error: status < 500 ? error.message : 'Внутренняя ошибка сервера' });
});
