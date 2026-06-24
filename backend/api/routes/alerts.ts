import { Router, Request, Response } from 'express';
import { requireAuth, AuthError } from '../lib/auth.js';
import { getAlerts, createAlert, updateAlert, deleteAlert } from '../lib/db/repositories.js';

const router = Router();

// GET /api/alerts
router.get('/', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    const status = req.query.status as string | undefined;
    res.json({ alerts: await getAlerts(userId, status) });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/alerts
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    for (const field of ['exchange', 'symbol', 'condition', 'target_value']) {
      if (req.body[field] == null) { res.status(400).json({ error: `${field} is required` }); return; }
    }
    res.status(201).json({ alert: await createAlert(userId, req.body) });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/alerts/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    const alert = await updateAlert(req.params.id, userId, req.body);
    if (!alert) { res.status(404).json({ error: 'Alert not found' }); return; }
    res.json({ alert });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/alerts/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    await deleteAlert(req.params.id, userId);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
