import { Router, Request, Response } from 'express';
import { requireAuth, AuthError } from '../lib/auth.js';
import { getPositions, getHoldings } from '../lib/db/repositories.js';

const router = Router();

// GET /api/positions
router.get('/positions', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    const date = req.query.date as string | undefined;
    res.json({ positions: await getPositions(userId, { date }) });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/holdings
router.get('/holdings', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    res.json({ holdings: await getHoldings(userId) });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
