import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

const SESSION_COOKIE = 'hae_dashboard_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const sessions = new Map<string, number>();

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, decodeURIComponent(rest.join('='))];
    }),
  );
}

function dashboardCredentials(): { username: string; password: string } {
  return {
    username: process.env.DASHBOARD_USERNAME || 'admin',
    password: process.env.DASHBOARD_PASSWORD || process.env.READ_TOKEN || '',
  };
}

export function createDashboardSession(): string {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

export function clearExpiredSessions(): void {
  const now = Date.now();
  for (const [token, expires] of sessions.entries()) {
    if (expires <= now) sessions.delete(token);
  }
}

function hasValidSession(req: Request): boolean {
  clearExpiredSessions();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return false;
  const expires = sessions.get(token);
  return expires !== undefined && expires > Date.now();
}

function hasValidBasicAuth(req: Request): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith('Basic ')) return false;

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator === -1) return false;

  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  const expected = dashboardCredentials();

  return username === expected.username && password === expected.password;
}

export function issueDashboardSessionCookie(res: Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/dashboard; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  );
}

export function requireDashboardAuth(req: Request, res: Response, next: NextFunction): void {
  if (hasValidSession(req) || hasValidBasicAuth(req)) {
    next();
    return;
  }

  if (req.path.startsWith('/dashboard/api/')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.status(401).send(renderLoginPage('Sign in to continue.'));
}

export function verifyDashboardLogin(username: string, password: string): boolean {
  const expected = dashboardCredentials();
  return username === expected.username && password === expected.password;
}

function renderLoginPage(message?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Health Auto Dashboard</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #09090b; color: #f4f4f5; min-height: 100vh; display: grid; place-items: center; margin: 0; }
      form { width: min(100%, 24rem); background: #18181b; border: 1px solid #27272a; border-radius: 0.75rem; padding: 1.5rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #a1a1aa; font-size: 0.875rem; margin: 0 0 1rem; }
      label { display: block; font-size: 0.875rem; margin-bottom: 0.25rem; color: #d4d4d8; }
      input { width: 100%; box-sizing: border-box; margin-bottom: 1rem; padding: 0.625rem 0.75rem; border-radius: 0.5rem; border: 1px solid #3f3f46; background: #09090b; color: #f4f4f5; }
      button { width: 100%; padding: 0.625rem 0.75rem; border: 0; border-radius: 0.5rem; background: #0891b2; color: white; font-weight: 600; cursor: pointer; }
      .error { color: #fca5a5; margin-bottom: 1rem; font-size: 0.875rem; }
    </style>
  </head>
  <body>
    <form method="post" action="/dashboard/login">
      <h1>Health Auto Dashboard</h1>
      <p>Sign in with the dashboard credentials from your .env file.</p>
      ${message ? `<div class="error">${message}</div>` : ''}
      <label for="username">Username</label>
      <input id="username" name="username" value="admin" autocomplete="username" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Sign in</button>
    </form>
  </body>
</html>`;
}
