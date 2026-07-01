import path from 'path';

import cors from 'cors';
import express from 'express';

import mongodb from './database/mongodb';
import { requireWriteAuth } from './middleware/auth';
import dashboardRouter from './routes/dashboard';
import ingesterRouter from './routes/ingester';
import metricsRouter from './routes/metrics';
import workoutsRouter from './routes/workouts';

const app = express();
const port = 3001;

mongodb.connect();

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
// Initial Health Metrics exports can be several hundred MB. Authenticate before
// buffering that body, and keep the unusually large limit scoped to ingestion.
app.use(
  '/api/data',
  requireWriteAuth,
  express.json({ limit: process.env.INGEST_BODY_LIMIT || '512mb' }),
  ingesterRouter,
);
app.use(express.json({ limit: '10mb' }));

app.use('/api/metrics', metricsRouter);
app.use('/api/workouts', workoutsRouter);
app.use('/dashboard/api/v1', dashboardRouter);

const webDistPath = path.join(__dirname, '../web/dist');
app.use('/dashboard', express.static(webDistPath));
app.get('/dashboard/*', (_req, res) => {
  res.sendFile(path.join(webDistPath, 'index.html'));
});

app.get('/', (_req, res) => {
  res.json({
    message: 'Health Auto Export server',
    dashboard: '/dashboard/',
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Dashboard available at http://localhost:${port}/dashboard/`);
});
