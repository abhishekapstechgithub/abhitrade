export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { isRedisAvailable, redis, KEYS } from '@/lib/redis-client';
import { loadFileIntoRedis } from '@/lib/security-master-loader';
import { createUploadJob, updateUploadJob } from '@/lib/db/repositories';
import { isDbAvailable } from '@/lib/db/client';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'tmp', 'uploads');

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const overwrite = formData.get('overwrite') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.csv', '.txt'].includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${ext}. Allowed: .csv, .txt` },
        { status: 400 },
      );
    }

    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 100 MB)' }, { status: 400 });
    }

    // Save to disk
    await mkdir(UPLOAD_DIR, { recursive: true });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = join(UPLOAD_DIR, `${Date.now()}_${safeName}`);
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    // Check Redis
    const redisOk = await isRedisAvailable();
    if (!redisOk) {
      return NextResponse.json(
        { error: 'Redis is not available. Start Docker services: docker compose up -d redis' },
        { status: 503 },
      );
    }

    // Create job record in PostgreSQL (best-effort — don't block upload if PG is down)
    let pgJobId: string | null = null;
    try {
      if (await isDbAvailable()) {
        pgJobId = await createUploadJob({
          filename: file.name,
          file_path: filePath,
          file_size: file.size,
        });
      }
    } catch (pgErr) {
      console.warn('[upload] PostgreSQL job record failed (continuing):', pgErr);
    }

    // Redis job key (primary job tracking during processing)
    const jobId = pgJobId ?? randomUUID();
    await redis.hset(KEYS.job(jobId), {
      status: 'queued',
      filename: file.name,
      fileSize: String(file.size),
      progress: '0',
      createdAt: new Date().toISOString(),
    });
    await redis.expire(KEYS.job(jobId), 86400);

    // Fire-and-forget; client polls /api/upload?jobId=...
    setImmediate(async () => {
      try {
        if (pgJobId) {
          await updateUploadJob(pgJobId, { status: 'processing', started_at: new Date().toISOString() });
        }
        const result = await loadFileIntoRedis(filePath, file.name, jobId, overwrite);
        if (pgJobId) {
          await updateUploadJob(pgJobId, {
            status: 'completed',
            total_rows: result.total,
            valid_rows: result.valid,
            invalid_rows: result.invalid,
            duplicate_rows: result.duplicates,
            completed_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error('[upload] loader error:', e);
        if (pgJobId) {
          await updateUploadJob(pgJobId, {
            status: 'failed',
            error_message: e instanceof Error ? e.message : String(e),
          });
        }
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
      message: 'POST a CSV file as multipart/form-data with field "file". Optional: overwrite=true.',
    });
  }

  // Return job status from Redis (live progress) or PostgreSQL (historical)
  try {
    const redisOk = await isRedisAvailable();
    if (redisOk) {
      const { redis: redisClient, KEYS: K } = await import('@/lib/redis-client');
      const data = await redisClient.hgetall(K.job(jobId));
      if (Object.keys(data).length) {
        return NextResponse.json({ jobId, ...data });
      }
    }
  } catch { /* fall through */ }

  // PostgreSQL fallback for completed jobs
  try {
    const { getUploadJob } = await import('@/lib/db/repositories');
    const job = await getUploadJob(jobId);
    if (job) return NextResponse.json(job);
  } catch { /* fall through */ }

  return NextResponse.json({ error: 'Job not found' }, { status: 404 });
}
