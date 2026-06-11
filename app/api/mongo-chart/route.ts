import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongodb';

const TF_SEC: Record<string, number> = {
  ONE_MINUTE:      60,
  THREE_MINUTE:   180,
  FIVE_MINUTE:    300,
  TEN_MINUTE:     600,
  FIFTEEN_MINUTE: 900,
  THIRTY_MINUTE: 1800,
  TWO_HOUR:      7200,
  FOUR_HOUR:    14400,
  ONE_HOUR:      3600,
  ONE_DAY:      86400,
  ONE_WEEK:    604800,
  ONE_MONTH:  2592000,
};

export async function GET(req: NextRequest) {
  const p          = req.nextUrl.searchParams;
  const symbol     = (p.get('symbol')   ?? '').toUpperCase().trim();
  const exchange   = (p.get('exchange') ?? 'NSE').toUpperCase().trim();
  const interval   = p.get('interval')  ?? 'ONE_DAY';
  const collection = p.get('col')       ?? 'tradechart';
  const limit      = Math.min(Math.max(parseInt(p.get('limit') ?? '500'), 50), 2000);
  // `before` = load candles whose bucket timestamp < this value (Unix seconds)
  // When 0/absent = get the most recent `limit` candles
  const before     = parseInt(p.get('before') ?? '') || 0;

  if (!symbol) return NextResponse.json({ error: 'symbol is required' }, { status: 400 });

  const bucketSec = TF_SEC[interval] ?? 86400;

  try {
    const db   = await getMongoDb();
    const coll = db.collection(collection);

    // Normalize a timestamp field to Unix seconds (handles ms and seconds)
    const normTs = (field: string) => ({
      $cond: {
        if:   { $gte: [field, 1e10] },
        then: { $divide: [field, 1000] },
        else: field,
      },
    });

    // ── Format 1: Start_Time / Open / High / Low / Close / Volume ──
    const pipe1 = [
      { $match: { Symbol: symbol, Exch: exchange, ...(before > 0 ? {} : {}) } },
      ...(before > 0 ? [{ $match: { $expr: { $lt: [normTs('$Start_Time'), before] } } }] : []),
      {
        $group: {
          _id:    { $multiply: [{ $floor: { $divide: [normTs('$Start_Time'), bucketSec] } }, bucketSec] },
          open:   { $first: '$Open'   },
          high:   { $max:   '$High'   },
          low:    { $min:   '$Low'    },
          close:  { $last:  '$Close'  },
          volume: { $sum:   '$Volume' },
        },
      },
      { $sort: { _id: before > 0 ? 1 : -1 } as Record<string,1|-1> },
      { $limit: limit },
    ];

    const fmt1 = await coll.aggregate(pipe1).toArray();

    if (fmt1.length > 0) {
      const sorted = before > 0 ? fmt1 : fmt1.reverse(); // ascending order
      return NextResponse.json({
        candles: sorted.map(r => [
          r._id,                              // Unix seconds — client converts
          r.open, r.high, r.low, r.close, r.volume ?? 0,
        ]),
        oldest:  sorted[0]?._id ?? 0,        // oldest bucket for pagination
        count:   sorted.length,
        hasMore: sorted.length >= limit,
        source: 'mongodb-fmt1',
      });
    }

    // ── Format 2: BC_DATE / BC_OPEN / BC_HIGH / BC_LOW / BC_CLOSE / BC_VOLUME ──
    const pipe2 = [
      { $match: { BC_SYMBOL: symbol, BC_EXCH: exchange } },
      ...(before > 0 ? [{ $match: { $expr: { $lt: [normTs('$BC_DATE'), before] } } }] : []),
      {
        $group: {
          _id:    { $multiply: [{ $floor: { $divide: [normTs('$BC_DATE'), bucketSec] } }, bucketSec] },
          open:   { $first: '$BC_OPEN'   },
          high:   { $max:   '$BC_HIGH'   },
          low:    { $min:   '$BC_LOW'    },
          close:  { $last:  '$BC_CLOSE'  },
          volume: { $sum:   '$BC_VOLUME' },
        },
      },
      { $sort: { _id: before > 0 ? 1 : -1 } as Record<string,1|-1> },
      { $limit: limit },
    ];

    const fmt2 = await coll.aggregate(pipe2).toArray();

    if (fmt2.length > 0) {
      const sorted = before > 0 ? fmt2 : fmt2.reverse();
      return NextResponse.json({
        candles: sorted.map(r => [
          r._id,
          r.open, r.high, r.low, r.close, r.volume ?? 0,
        ]),
        oldest:  sorted[0]?._id ?? 0,
        count:   sorted.length,
        hasMore: sorted.length >= limit,
        source: 'mongodb-fmt2',
      });
    }

    return NextResponse.json({ candles: [], count: 0, hasMore: false, message: `No data for ${symbol} on ${exchange}` });

  } catch (err) {
    console.error('[mongo-chart]', err);
    return NextResponse.json({ error: String(err), candles: [] }, { status: 500 });
  }
}
