import { Router, Request, Response } from 'express';

const router = Router();

const RELIGARE_BASE = 'https://leap.religareonline.com/TV/index.html';
const RELIGARE_API_KEY = process.env.RELIGARE_API_KEY ?? '0HVTVTkNzEg7Dwjd80T0bXbO8t8FThd';

const INDEX_SYMBOLS: Record<string, string> = {
  'NIFTY': '^NSEI', 'NIFTY 50': '^NSEI', 'NIFTY50': '^NSEI',
  'BANKNIFTY': '^NSEBANK', 'NIFTY BANK': '^NSEBANK',
  'FINNIFTY': '^CNXFIN', 'NIFTY FIN SERVICE': '^CNXFIN',
  'MIDCPNIFTY': '^CNXMIDCAP', 'SENSEX': '^BSESN', 'BANKEX': '^BSEBANK',
};

type YInterval = '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '1h' | '1d' | '1wk' | '1mo';
const INTERVAL_MAP: Record<string, { yahooInterval: YInterval; range: string }> = {
  ONE_MINUTE: { yahooInterval: '1m', range: '7d' }, THREE_MINUTE: { yahooInterval: '2m', range: '60d' },
  FIVE_MINUTE: { yahooInterval: '5m', range: '60d' }, TEN_MINUTE: { yahooInterval: '15m', range: '60d' },
  FIFTEEN_MINUTE: { yahooInterval: '15m', range: '60d' }, THIRTY_MINUTE: { yahooInterval: '30m', range: '60d' },
  ONE_HOUR: { yahooInterval: '1h', range: '730d' }, TWO_HOUR: { yahooInterval: '1h', range: '730d' },
  FOUR_HOUR: { yahooInterval: '1h', range: '730d' }, ONE_DAY: { yahooInterval: '1d', range: 'max' },
  ONE_WEEK: { yahooInterval: '1wk', range: 'max' }, ONE_MONTH: { yahooInterval: '1mo', range: 'max' },
};

// GET /api/chart — proxy Religare chart HTML
router.get('/chart', async (req: Request, res: Response) => {
  const token    = req.query.t as string ?? '';
  const mktsegid = req.query.s as string ?? '1';
  const interval = req.query.i as string ?? 'MIN';
  const style    = req.query.cs as string ?? 'line';
  const theme    = req.query.th as string ?? 'light';
  if (!token) { res.status(400).send('Bad request'); return; }
  const params = new URLSearchParams({ ver: 'v1', mode: 'advance', pid: '2', mktsegid, tkn: token, period: '1', interval, style, zoom: 'y', xaxis: 'y', yaxis: 'y', hdr: 'y', title: 'n', headsup: 'y', buysell: 'y', lookup: 'y', theme: theme === 'dark' ? 'd' : 'l', span: '', continuous: '', group: 'g1', apikey: RELIGARE_API_KEY, userid: 'test4' });
  try {
    const resp = await fetch(`${RELIGARE_BASE}?${params}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } });
    if (!resp.ok) { res.status(resp.status).send('<html><body>Chart unavailable</body></html>'); return; }
    let html = await resp.text();
    const baseTag = '<base href="https://leap.religareonline.com/TV/">';
    html = /<head/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`) : baseTag + html;
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN' }).send(html);
  } catch { res.status(502).send('<html><body>Chart unavailable</body></html>'); }
});

// GET /api/yahoo-chart
router.get('/yahoo-chart', async (req: Request, res: Response) => {
  const symbol         = (req.query.symbol as string ?? '').toUpperCase().trim();
  const exchange       = (req.query.exchange as string ?? 'NSE').toUpperCase();
  const interval       = req.query.interval as string ?? 'ONE_DAY';
  const instrumentType = (req.query.instrumentType as string ?? 'EQ').toUpperCase();
  if (!symbol) { res.status(400).json({ error: 'symbol is required' }); return; }

  function toYahooSymbol(sym: string, exch: string, instrType?: string): string {
    if (INDEX_SYMBOLS[sym]) return INDEX_SYMBOLS[sym];
    if (instrType === 'INDEX' || exch === 'NSE_INDEX' || exch === 'BSE_INDEX') return INDEX_SYMBOLS[sym] ?? `^${sym}`;
    if (exch === 'BSE') return `${sym}.BO`;
    return `${sym}.NS`;
  }

  const { yahooInterval, range } = INTERVAL_MAP[interval] ?? INTERVAL_MAP['ONE_DAY'];
  const yahooSym = toYahooSymbol(symbol, exchange, instrumentType);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?range=${range}&interval=${yahooInterval}&events=history&includePrePost=false`;

  try {
    const apiRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'application/json', 'Accept-Language': 'en-US,en;q=0.9', Referer: 'https://finance.yahoo.com/' } });
    if (!apiRes.ok) throw new Error(`Yahoo Finance returned ${apiRes.status}`);
    const data = await apiRes.json() as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open: (number|null)[]; high: (number|null)[]; low: (number|null)[]; close: (number|null)[]; volume: (number|null)[] }> } }>; error?: { description?: string } } };
    const err = data.chart?.error;
    if (err) throw new Error(err.description ?? 'Yahoo chart error');
    const result = data.chart?.result?.[0];
    const candles: [number,number,number,number,number,number][] = [];
    if (result?.timestamp?.length) {
      const q = result.indicators?.quote?.[0];
      if (q) {
        for (let i = 0; i < result.timestamp.length; i++) {
          const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i];
          if (o == null || h == null || l == null || c == null) continue;
          candles.push([result.timestamp[i] * 1000, +o.toFixed(2), +h.toFixed(2), +l.toFixed(2), +c.toFixed(2), v ?? 0]);
        }
      }
    }
    res.json({ candles, symbol, yahooSymbol: yahooSym, interval: yahooInterval, count: candles.length, hasMore: false, source: 'yahoo' });
  } catch (err) { res.status(502).json({ error: err instanceof Error ? err.message : String(err) }); }
});

export default router;
