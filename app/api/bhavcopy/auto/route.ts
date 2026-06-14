export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { downloadAndLoadBhavcopy } from '@/lib/bhavcopy-auto';
import { redis } from '@/lib/redis-client';

// POST /api/bhavcopy/auto           — trigger download for today
// POST /api/bhavcopy/auto?date=YYYY-MM-DD — trigger for specific date
export async function POST(req: Request) {
  try {
    const url    = new URL(req.url);
    const dateQs = url.searchParams.get('date');

    let forDate: Date | undefined;
    if (dateQs) {
      forDate = new Date(dateQs + 'T09:00:00+05:30');
      if (isNaN(forDate.getTime())) {
        return NextResponse.json({ error: 'Invalid date — use YYYY-MM-DD' }, { status: 400 });
      }
      // Clear last-download cache so re-download is forced
      await redis.del('at:bhavcopy:autodownload:last').catch(() => {});
    }

    await downloadAndLoadBhavcopy(forDate);
    const status = await redis.get('at:bhavcopy:last').catch(() => null);
    return NextResponse.json(status ? JSON.parse(status) : { ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET /api/bhavcopy/auto — last auto-download info
export async function GET() {
  const [last, date] = await Promise.all([
    redis.get('at:bhavcopy:last').catch(() => null),
    redis.get('at:bhavcopy:autodownload:last').catch(() => null),
  ]);
  return NextResponse.json({
    lastDownloadDate: date,
    lastLoadStatus:   last ? JSON.parse(last) : null,
  });
}
