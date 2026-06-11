export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { isRedisAvailable, redis, KEYS } from '@/lib/redis-client';
import { loadFileIntoMongo, type FileType } from '@/lib/mongo-security-loader';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'tmp', 'uploads');
const VALID_FILE_TYPES: FileType[] = ['NSE_CM', 'BSE_CM', 'NSE_FO', 'BSE_FO'];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file     = formData.get('file')     as File   | null;
    const fileType = formData.get('fileType') as string | null;
    const overwrite = formData.get('overwrite') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!fileType || !VALID_FILE_TYPES.includes(fileType as FileType)) {
      return NextResponse.json(
        { error: `fileType is required and must be one of: ${VALID_FILE_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.csv', '.txt'].includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${ext}. Allowed: .csv, .txt` },
        { status: 400 },
      );
    }
    if (file.size > 200 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 200 MB)' }, { status: 400 });
    }

    // Save to disk
    await mkdir(UPLOAD_DIR, { recursive: true });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = join(UPLOAD_DIR, `${Date.now()}_${safeName}`);
    const bytes    = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    // Redis for job tracking
    const redisOk = await isRedisAvailable();
    if (!redisOk) {
      return NextResponse.json(
        { error: 'Redis is not available. Start services: docker-compose up -d redis' },
        { status: 503 },
      );
    }

    const jobId = randomUUID();
    await redis.hset(KEYS.job(jobId), {
      status:    'queued',
      filename:  file.name,
      fileType:  fileType,
      fileSize:  String(file.size),
      progress:  '0',
      createdAt: new Date().toISOString(),
    });
    await redis.expire(KEYS.job(jobId), 86400);

    // Fire-and-forget processing
    setImmediate(async () => {
      try {
        await loadFileIntoMongo(filePath, file.name, fileType as FileType, jobId, overwrite);
      } catch (e) {
        console.error('[upload] loader error:', e);
        const msg = e instanceof Error ? e.message : String(e);
        await redis.hset(KEYS.job(jobId), { status: 'error', error: msg });
      }
    });

    return NextResponse.json({ jobId, status: 'queued', message: 'Upload queued' });
  } catch (err: unknown) {
    console.error('[upload] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({
      message: 'POST a CSV file with fields: file, fileType (NSE_CM|BSE_CM|NSE_FO|BSE_FO), overwrite (optional)',
    });
  }
  try {
    const data = await redis.hgetall(KEYS.job(jobId));
    if (Object.keys(data).length) return NextResponse.json({ jobId, ...data });
  } catch { /* fall through */ }
  return NextResponse.json({ error: 'Job not found' }, { status: 404 });
}
