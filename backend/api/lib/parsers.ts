/**
 * Parsers for all 4 NSE/BSE contract master CSV formats.
 * Returns a normalised InstrumentRecord array per file.
 */

export interface InstrumentRecord {
  token: string;
  exchange: 'NSE' | 'BSE';
  symbol: string;           // underlying / ticker (RELIANCE, BANKNIFTY…)
  tradingSymbol: string;    // full trading symbol (BANKNIFTY24JUN65400CE)
  name: string;             // company / contract name
  instrumentType: string;   // EQ | FUT | CE | PE | ETF | INDEX
  series?: string;          // EQ, BE, etc. (equities)
  isin?: string;
  lotSize: number;
  tickSize: number;
  expiry?: string;          // ISO date string YYYY-MM-DD
  strike?: number;          // in ₹ (already divided)
  optionType?: 'CE' | 'PE';
  underlying?: string;      // for derivatives
  underlyingToken?: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function num(v: string | undefined, fallback = 0): number {
  const n = Number(v ?? fallback);
  return isNaN(n) ? fallback : n;
}

/** Convert Unix timestamp (seconds) → ISO date string */
function unixToDate(ts: string | undefined): string | undefined {
  if (!ts || ts === '0') return undefined;
  const n = num(ts);
  if (n <= 0) return undefined;
  return new Date(n * 1000).toISOString().slice(0, 10);
}

/** Convert "27-Aug-26" or "27-Aug-2026" → "2026-08-27" */
const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};
function bseDateToISO(d: string | undefined): string | undefined {
  if (!d) return undefined;
  const m = d.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!m) return undefined;
  const day = m[1].padStart(2, '0');
  const mon = MONTHS[m[2]] ?? '01';
  const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${yr}-${mon}-${day}`;
}

/** Derive instrument type from NSE/BSE FinInstrmNm / OptnTp */
function deriveType(instrNm: string, optnTp: string): string {
  const n = instrNm.toUpperCase();
  if (n.includes('OPTIDX') || n.includes('OPTSTK')) {
    return optnTp === 'CE' ? 'CE' : optnTp === 'PE' ? 'PE' : 'OPT';
  }
  if (n.includes('FUTIDX') || n.includes('FUTSTK') || n.includes('FUTCUR')) return 'FUT';
  if (n.includes('SO')) return optnTp === 'CE' ? 'CE' : optnTp === 'PE' ? 'PE' : 'OPT';
  return 'FUT';
}

// ─── NSE Cash Market (NSE_CM_security) ───────────────────────────────────────
// Cols: FinInstrmId, TckrSymb, SctySrs, FinInstrmNm, ISIN, NewBrdLotQty, BidIntrvl …

export function parseNSECM(rows: Record<string, string>[]): InstrumentRecord[] {
  return rows
    .filter(r => r.TckrSymb && r.TckrSymb.trim() && r.DelFlg !== 'Y')
    .map(r => ({
      token: r.FinInstrmId?.trim(),
      exchange: 'NSE' as const,
      symbol: r.TckrSymb.trim(),
      tradingSymbol: `${r.TckrSymb.trim()}-NSE-${(r.SctySrs ?? 'EQ').trim()}`,
      name: r.FinInstrmNm?.trim() ?? r.TckrSymb.trim(),
      instrumentType: 'EQ',
      series: r.SctySrs?.trim(),
      isin: r.ISIN?.trim(),
      lotSize: num(r.NewBrdLotQty, 1),
      tickSize: num(r.BidIntrvl, 0.05),
    }))
    .filter(r => r.token);
}

// ─── NSE F&O (NSE_FO_contract) ────────────────────────────────────────────────
// Cols: FinInstrmId, UndrlygFinInstrmId, FinInstrmNm, TckrSymb, XpryDt,
//       StrkPric (paise), OptnTp, MinLot, StockNm …

export function parseNSEFO(rows: Record<string, string>[]): InstrumentRecord[] {
  return rows
    .filter(r => r.TckrSymb && r.TckrSymb.trim() && r.DelFlg !== 'Y')
    .map(r => {
      const type = deriveType(r.FinInstrmNm ?? '', r.OptnTp ?? '');
      const strike = r.StrkPric ? num(r.StrkPric) / 100 : undefined;
      const expiry = unixToDate(r.XpryDt);
      const tradingSymbol = r.StockNm?.trim() || r.TckrSymb.trim();
      return {
        token: r.FinInstrmId?.trim(),
        exchange: 'NSE' as const,
        symbol: r.TckrSymb.trim(),
        tradingSymbol,
        name: tradingSymbol,
        instrumentType: type,
        lotSize: num(r.MinLot, 1),
        tickSize: num(r.BidIntrvl, 0.05),
        expiry,
        strike: strike && strike > 0 ? strike : undefined,
        optionType: (r.OptnTp === 'CE' || r.OptnTp === 'PE') ? (r.OptnTp as 'CE' | 'PE') : undefined,
        underlying: r.TckrSymb.trim(),
        underlyingToken: r.UndrlygFinInstrmId?.trim(),
      };
    })
    .filter(r => r.token);
}

// ─── BSE F&O (BSE_EQD_CONTRACT) ──────────────────────────────────────────────
// Same columns as NSE_FO but XpryDt = "27-Aug-26", StrkPric in paise
// FinInstrmNm: SO (Stock Option), SF (Stock Futures), IO (Index Option), IF (Index Futures)

export function parseBSEFO(rows: Record<string, string>[]): InstrumentRecord[] {
  return rows
    .filter(r => r.TckrSymb && r.TckrSymb.trim() && r.DelFlg === 'A')
    .map(r => {
      const type = deriveType(r.FinInstrmNm ?? 'SO', r.OptnTp ?? '');
      const rawStrike = r.StrkPric ? num(r.StrkPric) : undefined;
      // BSE strikes are in paise (162000 = ₹1620), but sometimes in rupees already
      // Heuristic: if > 10000 and looks like paise, divide by 100
      const strike = rawStrike && rawStrike > 0
        ? (rawStrike > 10000 ? rawStrike / 100 : rawStrike)
        : undefined;
      const expiry = bseDateToISO(r.XpryDt);
      const tradingSymbol = r.StockNm?.trim() || r.TckrSymb.trim();
      return {
        token: r.FinInstrmId?.trim(),
        exchange: 'BSE' as const,
        symbol: r.TckrSymb.trim(),
        tradingSymbol,
        name: tradingSymbol,
        instrumentType: type,
        lotSize: num(r.MinLot, 1),
        tickSize: num(r.BidIntrvl, 0.05),
        expiry,
        strike: strike && strike > 0 ? strike : undefined,
        optionType: (r.OptnTp === 'CE' || r.OptnTp === 'PE') ? (r.OptnTp as 'CE' | 'PE') : undefined,
        underlying: r.TckrSymb.trim(),
        underlyingToken: r.UndrlygFinInstrmId?.trim(),
      };
    })
    .filter(r => r.token);
}

// ─── BSE Equity (BSE_EQ_SCRIP) ────────────────────────────────────────────────
// Same columns as NSE_CM but Exchange = BSE

export function parseBSEEQ(rows: Record<string, string>[]): InstrumentRecord[] {
  return rows
    .filter(r => r.TckrSymb && r.TckrSymb.trim() && r.DelFlg !== 'Y')
    .map(r => ({
      token: r.FinInstrmId?.trim(),
      exchange: 'BSE' as const,
      symbol: r.TckrSymb.trim().replace('#', ''),  // BSE has trailing # sometimes
      tradingSymbol: `${r.TckrSymb.trim().replace('#', '')}-BSE-${(r.SctySrs ?? 'A').trim()}`,
      name: r.FinInstrmNm?.trim() ?? r.TckrSymb.trim(),
      instrumentType: 'EQ',
      series: r.SctySrs?.trim(),
      isin: r.ISIN?.trim(),
      lotSize: num(r.NewBrdLotQty, 1),
      tickSize: num(r.BidIntrvl, 0.05),
    }))
    .filter(r => r.token);
}

// ─── Auto-detect file type from headers ───────────────────────────────────────

export type FileFormat = 'NSE_CM' | 'NSE_FO' | 'BSE_FO' | 'BSE_EQ' | 'UNKNOWN';

export function detectFormat(headers: string[], filename: string): FileFormat {
  const fn = filename.toUpperCase();
  // By filename first (most reliable)
  if (fn.includes('NSE_CM') || fn.includes('NSE_EQ') || fn.includes('NSE_SECURITY')) return 'NSE_CM';
  if (fn.includes('NSE_FO') || fn.includes('NSE_FO_CONTRACT')) return 'NSE_FO';
  if (fn.includes('BSE_EQD') || fn.includes('BSE_FO') || fn.includes('BSE_EQD_CONTRACT')) return 'BSE_FO';
  if (fn.includes('BSE_EQ_SCRIP') || fn.includes('BSE_EQ')) return 'BSE_EQ';

  // By header content
  const h = headers.join(',').toUpperCase();
  const hasFO = h.includes('XPRYDT') && h.includes('STRKPRIC') && h.includes('OPTNTP');
  if (hasFO) {
    // Distinguish NSE_FO vs BSE_FO by XpryDt format — check first data row in caller
    return 'NSE_FO'; // default, caller must verify
  }
  if (h.includes('TCKRSYMB') && h.includes('SCTYSRS')) return 'NSE_CM';
  return 'UNKNOWN';
}

export function parseByFormat(
  format: FileFormat,
  rows: Record<string, string>[],
): InstrumentRecord[] {
  switch (format) {
    case 'NSE_CM': return parseNSECM(rows);
    case 'NSE_FO': return parseNSEFO(rows);
    case 'BSE_FO': return parseBSEFO(rows);
    case 'BSE_EQ': return parseBSEEQ(rows);
    default: return [];
  }
}
