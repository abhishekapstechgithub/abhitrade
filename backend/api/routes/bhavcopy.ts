import { Router, Request, Response } from 'express';
import { writeFile, mkdir } from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { redis } from '../lib/redis-client.js';
import { loadBhavcopy } from '../lib/bhavcopy.js';
import { loadIndexBhavcopy } from '../lib/index-bhavcopy.js';
import { downloadAndLoadBhavcopy } from '../lib/bhavcopy-auto.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const BHAV_KEY  = 'at:bhavcopy:last';
const INDEX_KEY = 'at:index-bhavcopy:last';

// GET /api/bhavcopy
router.get('/bhavcopy', async (_req: Request, res: Response) => {
  try {
    const cached = await redis.get(BHAV_KEY).catch(() => null);
    if (cached) { res.json(JSON.parse(cached)); return; }
    res.json({ files: 0, totalLoaded: 0, totalSkipped: 0, results: [], loadedAt: null });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
// POST /api/bhavcopy
router.post('/bhavcopy', async (_req: Request, res: Response) => {
  try {
    const stats  = await loadBhavcopy();
    const status = { ...stats, loadedAt: new Date().toISOString() };
    await redis.set(BHAV_KEY, JSON.stringify(status)).catch(() => {});
    res.json(status);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// POST /api/bhavcopy/upload
router.post('/bhavcopy/upload', upload.array('file'), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) { res.status(400).json({ error: 'No file(s) attached — field name must be "file"' }); return; }
  for (const f of files) {
    if (!/\.csv$/i.test(f.originalname)) { res.status(400).json({ error: `${f.originalname} is not a CSV file` }); return; }
  }
  const bhavDir = path.join(process.cwd(), 'Bhavcopy');
  const saved: string[] = [];
  try {
    await mkdir(bhavDir, { recursive: true });
    for (const file of files) {
      const dest = path.join(bhavDir, file.originalname);
      await writeFile(dest, file.buffer);
      saved.push(file.originalname);
    }
  } catch (err) { res.status(500).json({ error: `Failed to save file: ${err instanceof Error ? err.message : String(err)}` }); return; }
  try {
    const stats  = await loadBhavcopy();
    const status = { ...stats, savedFiles: saved, loadedAt: new Date().toISOString() };
    await redis.set(BHAV_KEY, JSON.stringify(status)).catch(() => {});
    res.json(status);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err), savedFiles: saved }); }
});

// GET /api/bhavcopy/auto
router.get('/bhavcopy/auto', async (_req: Request, res: Response) => {
  const [last, date] = await Promise.all([redis.get(BHAV_KEY).catch(() => null), redis.get('at:bhavcopy:autodownload:last').catch(() => null)]);
  res.json({ lastDownloadDate: date, lastLoadStatus: last ? JSON.parse(last) : null });
});
// POST /api/bhavcopy/auto
router.post('/bhavcopy/auto', async (req: Request, res: Response) => {
  try {
    const dateQs = req.query.date as string | undefined;
    let forDate: Date | undefined;
    if (dateQs) {
      forDate = new Date(dateQs + 'T09:00:00+05:30');
      if (isNaN(forDate.getTime())) { res.status(400).json({ error: 'Invalid date — use YYYY-MM-DD' }); return; }
      await redis.del('at:bhavcopy:autodownload:last').catch(() => {});
    }
    await downloadAndLoadBhavcopy(forDate);
    const status = await redis.get(BHAV_KEY).catch(() => null);
    res.json(status ? JSON.parse(status) : { ok: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// GET /api/index-bhavcopy
router.get('/index-bhavcopy', async (_req: Request, res: Response) => {
  try {
    const cached = await redis.get(INDEX_KEY).catch(() => null);
    if (cached) { res.json(JSON.parse(cached)); return; }
    res.json({ files: 0, totalLoaded: 0, totalSkipped: 0, results: [], loadedAt: null });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
// POST /api/index-bhavcopy
router.post('/index-bhavcopy', async (_req: Request, res: Response) => {
  try {
    const stats  = await loadIndexBhavcopy();
    const status = { ...stats, loadedAt: new Date().toISOString() };
    await redis.set(INDEX_KEY, JSON.stringify(status)).catch(() => {});
    res.json(status);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// POST /api/index-bhavcopy/upload
router.post('/index-bhavcopy/upload', upload.array('file'), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) { res.status(400).json({ error: 'No file(s) attached' }); return; }
  for (const f of files) {
    if (!/\.csv$/i.test(f.originalname)) { res.status(400).json({ error: `${f.originalname} is not a CSV file` }); return; }
  }
  const idxDir = path.join(process.cwd(), 'index');
  await mkdir(idxDir, { recursive: true });
  const saved: string[] = [];
  for (const file of files) {
    await writeFile(path.join(idxDir, file.originalname), file.buffer);
    saved.push(file.originalname);
  }
  try {
    const stats  = await loadIndexBhavcopy(idxDir);
    const status = { ...stats, savedFiles: saved, loadedAt: new Date().toISOString() };
    await redis.set(INDEX_KEY, JSON.stringify(status)).catch(() => {});
    res.json(status);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err), savedFiles: saved }); }
});

export default router;
