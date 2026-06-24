import type { Request, Response, NextFunction } from 'express';
import { requireAuth, AuthError, type AuthPayload } from '../lib/auth.js';

export interface AuthedRequest extends Request {
  user: AuthPayload;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await requireAuth(req.headers.cookie);
    (req as AuthedRequest).user = user;
    next();
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      next(err);
    }
  }
}
