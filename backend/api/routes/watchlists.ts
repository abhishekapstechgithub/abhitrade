import { Router, Request, Response } from 'express';
import { requireAuth, AuthError } from '../lib/auth.js';
import { getWatchlists, createWatchlist, updateWatchlist, deleteWatchlist, getWatchlistItems, addWatchlistItem, removeWatchlistItem } from '../lib/db/repositories.js';

const router = Router();

// GET /api/watchlists
router.get('/', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    res.json({ watchlists: await getWatchlists(userId) });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    console.error('[watchlists GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/watchlists
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    const { name } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
    res.status(201).json({ watchlist: await createWatchlist(userId, name.trim()) });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/watchlists/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    const list = await updateWatchlist(req.params.id, userId, req.body);
    if (!list) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ watchlist: list });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/watchlists/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    await deleteWatchlist(req.params.id, userId);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/watchlists/:id/items
router.get('/:id/items', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    const lists = await getWatchlists(userId);
    if (!lists.find((l: { id: string }) => l.id === req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ items: await getWatchlistItems(req.params.id) });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/watchlists/:id/items
router.post('/:id/items', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    const lists = await getWatchlists(userId);
    if (!lists.find((l: { id: string }) => l.id === req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    if (!req.body.symbol || !req.body.exchange) { res.status(400).json({ error: 'symbol and exchange are required' }); return; }
    const item = await addWatchlistItem(req.params.id, req.body);
    if (!item) { res.status(409).json({ error: 'Already in watchlist' }); return; }
    res.status(201).json({ item });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/watchlists/:id/items/:itemId
router.delete('/:id/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    const lists = await getWatchlists(userId);
    if (!lists.find((l: { id: string }) => l.id === req.params.id)) { res.status(404).json({ error: 'Not found' }); return; }
    await removeWatchlistItem(req.params.itemId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
