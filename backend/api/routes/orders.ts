import { Router, Request, Response } from 'express';
import { requireAuth, AuthError } from '../lib/auth.js';
import { getOrders, createOrder, updateOrder, cancelOrder } from '../lib/db/repositories.js';

const router = Router();

// GET /api/orders
router.get('/', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    const status = req.query.status as string | undefined;
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    res.json({ orders: await getOrders(userId, { status, limit, offset }) });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/orders
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    const required = ['exchange', 'symbol', 'transaction_type', 'order_type', 'product_type', 'quantity'];
    for (const field of required) {
      if (!req.body[field]) { res.status(400).json({ error: `${field} is required` }); return; }
    }
    res.status(201).json({ order: await createOrder(userId, req.body) });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/orders/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    const order = await updateOrder(req.params.id, userId, req.body);
    if (!order) { res.status(404).json({ error: 'Order not found or not modifiable' }); return; }
    res.json({ order });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/orders/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { sub: userId } = await requireAuth(req.headers.cookie);
    const order = await cancelOrder(req.params.id, userId);
    if (!order) { res.status(404).json({ error: 'Order not found or already terminal' }); return; }
    res.json({ order });
  } catch (err) {
    if (err instanceof AuthError) { res.status(401).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
