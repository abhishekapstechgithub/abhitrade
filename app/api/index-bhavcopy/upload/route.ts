export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { loadIndexBhavcopy } from '@/lib/index-bhavcopy';
import { redis } from '@/lib/redis-client';

const STATUS_KEY = 'at:index-bhavcopy:last';

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const files = formData.getAll('file') as File[];
  if (!files.length) {
    return NextResponse.json({ error: 'No file(s) attached — field name must be "file"' }, { status: 400 });
  }

  for (const f of files) {
    if (!/\.(csv)$/i.test(f.name)) {
      return NextResponse.json({ error: `${f.name} is not a CSV file` }, { status: 400 });
    }
  }

  const idxDir = path.join(process.cwd(), 'index');
  await mkdir(idxDir, { recursive: true });

  const saved: string[] = [];
  for (const file of files) {
    const buf  = Buffer.from(await file.arrayBuffer());
    const dest = path.join(idxDir, file.name);
    await writeFile(dest, buf);
    saved.push(file.name);
  }

  try {
    const stats  = await loadIndexBhavcopy(idxDir);
    const status = { ...stats, savedFiles: saved, loadedAt: new Date().toISOString() };
    await redis.set(STATUS_KEY, JSON.stringify(status)).catch(() => {});
    return NextResponse.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, savedFiles: saved }, { status: 500 });
  }
}
