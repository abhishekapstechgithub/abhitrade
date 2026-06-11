export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { loadBhavcopy } from '@/lib/bhavcopy';
import { redis } from '@/lib/redis-client';

const STATUS_KEY = 'at:bhavcopy:last';

// POST /api/bhavcopy/upload  — multipart: one or more CSV files
// Saves each file into <cwd>/Bhavcopy/ then runs the loader and returns stats.
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

  // Validate all are CSV
  for (const f of files) {
    if (!/\.(csv)$/i.test(f.name)) {
      return NextResponse.json({ error: `${f.name} is not a CSV file` }, { status: 400 });
    }
  }

  const bhavDir = path.join(process.cwd(), 'Bhavcopy');
  const saved: string[] = [];

  try {
    await mkdir(bhavDir, { recursive: true });

    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const dest = path.join(bhavDir, file.name);
      await writeFile(dest, buf);
      saved.push(file.name);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to save file: ${msg}` }, { status: 500 });
  }

  // Run the loader on the whole directory (picks up just-saved files + any existing)
  try {
    const stats = await loadBhavcopy();
    const status = { ...stats, savedFiles: saved, loadedAt: new Date().toISOString() };
    await redis.set(STATUS_KEY, JSON.stringify(status)).catch(() => {});
    return NextResponse.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, savedFiles: saved }, { status: 500 });
  }
}
