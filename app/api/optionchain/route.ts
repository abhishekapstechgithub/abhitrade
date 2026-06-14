/**
 * GET /api/optionchain
 *
 * Query params:
 *   symbol      NIFTY | BANKNIFTY | FINNIFTY | RELIANCE …  (required)
 *   expiry      YYYY-MM-DD                                   (required)
 *   strikeCount number of strikes each side of ATM           (default: 15)
 *   fromStrike  custom range start                           (optional)
 *   toStrike    custom range end                             (optional)
 *
 * Response: OptionChainResponse
 *
 * Performance targets:
 *   - Security master  → in-memory (0ms)
 *   - Quotes           → Redis pipeline (2–5ms)
 *   - Analytics        → synchronous (0ms)
 *   - Chain cache      → Redis GET (1–2ms, 5s TTL)
 *   - Total API p99    → < 20ms
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildOptionChain }          from '@/lib/optionchain/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EXPIRY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const p     = req.nextUrl.searchParams;
  const symbol = (p.get('symbol') ?? '').trim().toUpperCase();
  const expiry = (p.get('expiry') ?? '').trim();

  // ── Validation ──────────────────────────────────────────────────────────────

  if (!symbol) {
    return NextResponse.json(
      { error: 'symbol is required', example: '/api/optionchain?symbol=NIFTY&expiry=2025-06-26' },
      { status: 400 },
    );
  }
  if (!expiry) {
    return NextResponse.json(
      { error: 'expiry is required (YYYY-MM-DD)', example: '/api/optionchain?symbol=NIFTY&expiry=2025-06-26' },
      { status: 400 },
    );
  }
  if (!EXPIRY_RE.test(expiry)) {
    return NextResponse.json(
      { error: `Invalid expiry format "${expiry}". Use YYYY-MM-DD.` },
      { status: 400 },
    );
  }

  const strikeCount = Math.min(
    50,
    Math.max(1, Number(p.get('strikeCount') ?? 15)),
  );
  const fromStrike  = p.get('fromStrike')  ? Number(p.get('fromStrike'))  : undefined;
  const toStrike    = p.get('toStrike')    ? Number(p.get('toStrike'))    : undefined;

  // ── Build ───────────────────────────────────────────────────────────────────

  const t0 = Date.now();

  try {
    const chain = await buildOptionChain({ symbol, expiry, strikeCount, fromStrike, toStrike });

    const elapsed = Date.now() - t0;

    return NextResponse.json(
      { ...chain, _latencyMs: elapsed },
      {
        headers: {
          'Cache-Control':               'no-store',
          'X-Option-Chain-Latency-Ms':   String(elapsed),
          'X-Option-Chain-Source':       chain.source,
          'X-Option-Chain-Rows':         String(chain.rows.length),
        },
      },
    );
  } catch (err) {
    const msg = (err as Error).message;

    if (msg.includes('No instruments')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes('Spot price unavailable')) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }

    console.error('[/api/optionchain]', err);
    return NextResponse.json(
      { error: 'Internal server error', detail: msg },
      { status: 500 },
    );
  }
}
