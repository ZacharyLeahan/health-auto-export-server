import { Request, Response, NextFunction } from 'express';

/**
 * Authentication middleware for write access
 */
export const requireWriteAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers['api-key'] as string;

  if (!token || !token.startsWith('sk-') || token !== process.env.WRITE_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid write token' });
  }

  next();
};
