import { Router, Request, Response } from 'express';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { isRedisAvailable, redis, KEYS } from '../lib/redis-client.js';
import { loadFileIntoDb, type FileType } from '../lib/security-loader.js';
import { getJob } from '../lib/security-master-loader.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'tmp', 'uploads');
const VALID_FILE_TYPES: FileType[] = ['NSE_CM', 'BSE_CM', 'NSE_FO', 'BSE_FO'];

// POST /api/upload
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const file     = req.file;
  const fileType = req.body.fileType as string | undefined;
  const overwrite = req.body.overwrite === 'true';

  if (!file) { res.status(400).json({ error: 'No file provided' }); return; }
  if (!fileType || !VALID_FILE_TYPES.includes(fileType as FileType)) {
    res.status(400).json({ error: `fileType is required and must be one of: ${VALID_FILE_TYPES.join(', ')}` }); return;
  }
  const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
  if (!['.csv', '.txt'].includes(ext)) { res.status(400).json({ error: `Unsupported file type: ${ext}. Allowed: .csv, .txt` }); return; }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = join(UPLOAD_DIR, `${Date.now()}_${safeName}`);
  await writeFile(filePath, file.buffer);

  const redisOk = await isRedisAvailable();
  if (!redisOk) { res.status(503).json({ error: 'Redis is not available. Start services: docker-compose up -d redis' }); return; }

  const jobId = randomUUID();
  await redis.hset(KEYS.job(jobId), { status: 'queued', filename: file.originalname, fileType, fileSize: String(file.size), progress: '0', createdAt: new Date().toISOString() });
  await redis.expire(KEYS.job(jobId), 86400);

  setImmediate(async () => {
    try { await loadFileIntoDb(filePath, file.originalname, fileType as FileType, jobId, overwrite); }
    catch (e) { await redis.hset(KEYS.job(jobId), { status: 'error', error: e instanceof Error ? e.message : String(e) }); }
  });

  res.json({ jobId, status: 'queued', message: 'Upload queued' });
});

// GET /api/upload/status/:jobId
router.get('/status/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  if (!jobId) { res.status(400).json({ error: 'Missing jobId' }); return; }
  const job = await getJob(jobId);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  res.json({ jobId, status: job.status, progress: Number(job.progress ?? 0), filename: job.filename, format: job.format, exchange: job.exchange, totalRows: job.totalRows ? Number(job.totalRows) : undefined, valid: job.valid ? Number(job.valid) : undefined, invalid: job.invalid ? Number(job.invalid) : undefined, loaded: job.loaded ? Number(job.loaded) : undefined, durationMs: job.durationMs ? Number(job.durationMs) : undefined, error: job.error, completedAt: job.completedAt, createdAt: job.createdAt });
});

export default router;
