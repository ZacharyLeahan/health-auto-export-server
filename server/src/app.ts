import path from 'path';

import cors from 'cors';
import express from 'express';

import mongodb from './database/mongodb';
import ingesterRouter from './routes/ingester';
import metricsRouter from './routes/metrics';
import workoutsRouter from './routes/workouts';
import dashboardRouter from './routes/dashboard';
import { requireReadAuth, requireWriteAuth } from './middleware/auth';
import {
  createDashboardSession,
  issueDashboardSessionCookie,
  requireDashboardAuth,
  verifyDashboardLogin,
} from './middleware/dashboardAuth';

const app = express();
const port = 3001;

mongodb.connect();

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/api/data', requireWriteAuth, ingesterRouter);
app.use('/api/metrics', requireReadAuth, metricsRouter);
app.use('/api/workouts', requireReadAuth, workoutsRouter);

app.post('/dashboard/login', (req, res) => {
  const username = String(req.body.username || '');
  const password = String(req.body.password || '');

  if (!verifyDashboardLogin(username, password)) {
    res.status(401).send('Invalid credentials. <a href="/dashboard/">Try again</a>');
    return;
  }

  const token = createDashboardSession();
  issueDashboardSessionCookie(res, token);
  res.redirect('/dashboard/');
});

app.use('/dashboard', requireDashboardAuth);
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
