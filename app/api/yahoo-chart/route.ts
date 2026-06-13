export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

// ── Yahoo Finance symbol mapping ──────────────────────────────────────────────
const INDEX_SYMBOLS: Record<string, string> = {
  'NIFTY':          '^NSEI',
  'NIFTY 50':       '^NSEI',
  'NIFTY50':        '^NSEI',
  'BANKNIFTY':      '^NSEBANK',
  'NIFTY BANK':     '^NSEBANK',
  'FINNIFTY':       '^CNXFIN',
  'NIFTY FIN SERVICE': '^CNXFIN',
  'MIDCPNIFTY':     '^CNXMIDCAP',
  'SENSEX':         '^BSESN',
  'BANKEX':         '^BSEBANK',
};

function toYahooSymbol(symbol: string, exchange: string, instrumentType?: string): string {
  const sym = symbol.toUpperCase().trim();
  const exch = (exchange ?? '').toUpperCase();
  if (INDEX_SYMBOLS[sym]) return INDEX_SYMBOLS[sym];
  if (instrumentType === 'INDEX' || exch === 'NSE_INDEX' || exch === 'BSE_INDEX') {
    return INDEX_SYMBOLS[sym] ?? `^${sym}`;
  }
  if (exch === 'BSE') return `${sym}.BO`;
  return `${sym}.NS`; // default NSE
}

// ── Interval mapping ──────────────────────────────────────────────────────────
type YInterval = '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '1h' | '1d' | '1wk' | '1mo';
const INTERVAL_MAP: Record<string, { yahooInterval: YInterval; range: string }> = {
  ONE_MINUTE:      { yahooInterval: '1m',   range: '7d'  },
  THREE_MINUTE:    { yahooInterval: '2m',   range: '60d' },
  FIVE_MINUTE:     { yahooInterval: '5m',   range: '60d' },
  TEN_MINUTE:      { yahooInterval: '15m',  range: '60d' },
  FIFTEEN_MINUTE:  { yahooInterval: '15m',  range: '60d' },
  THIRTY_MINUTE:   { yahooInterval: '30m',  range: '60d' },
  ONE_HOUR:        { yahooInterval: '1h',   range: '730d' },
  TWO_HOUR:        { yahooInterval: '1h',   range: '730d' },
  FOUR_HOUR:       { yahooInterval: '1h',   range: '730d' },
  ONE_DAY:         { yahooInterval: '1d',   range: 'max' },
  ONE_WEEK:        { yahooInterval: '1wk',  range: 'max' },
  ONE_MONTH:       { yahooInterval: '1mo',  range: 'max' },
};

// ── Fetch from Yahoo Finance ──────────────────────────────────────────────────
interface YahooChartResult {
  timestamp?: number[];
  indicators?: {
    quote?: { open: (number|null)[]; high: (number|null)[]; low: (number|null)[]; close: (number|null)[]; volume: (number|null)[] }[];
  };
}

async function fetchYahoo(yahooSym: string, yInterval: YInterval, range: string): Promise<[number,number,number,number,number,number][]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?range=${range}&interval=${yInterval}&events=history&includePrePost=false`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://finance.yahoo.com/',
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status}`);
  const data = await res.json() as { chart?: { result?: YahooChartResult[]; error?: { description?: string } } };
  const err = data.chart?.error;
  if (err) throw new Error(err.description ?? 'Yahoo chart error');
  const result = data.chart?.result?.[0];
  if (!result?.timestamp?.length) return [];

  const { timestamp } = result;
  const q = result.indicators?.quote?.[0];
  if (!q) return [];

  const candles: [number,number,number,number,number,number][] = [];
  for (let i = 0; i < timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push([timestamp[i] * 1000, +o.toFixed(2), +h.toFixed(2), +l.toFixed(2), +c.toFixed(2), v ?? 0]);
  }
  return candles;
}

// ── GET /api/yahoo-chart ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const p              = req.nextUrl.searchParams;
  const symbol         = (p.get('symbol')         ?? '').toUpperCase().trim();
  const exchange       = (p.get('exchange')        ?? 'NSE').toUpperCase();
  const interval       = p.get('interval')         ?? 'ONE_DAY';
  const instrumentType = (p.get('instrumentType')  ?? 'EQ').toUpperCase();

  if (!symbol) return NextResponse.json({ error: 'symbol is required' }, { status: 400 });

  const { yahooInterval, range } = INTERVAL_MAP[interval] ?? INTERVAL_MAP['ONE_DAY'];
  const yahooSym = toYahooSymbol(symbol, exchange, instrumentType);

  try {
    const candles = await fetchYahoo(yahooSym, yahooInterval, range);
    return NextResponse.json({
      candles,
      symbol,
      yahooSymbol: yahooSym,
      interval: yahooInterval,
      count: candles.length,
      hasMore: false,
      source: 'yahoo',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
