import type {
  BacktestResult, TradeRecord, EquityPoint,
  MonthlyReturn, BacktestMetrics,
} from '../types/backtest.types';

// ─── Raw trade seeds ──────────────────────────────────────────────────────────
// Each row: [entryDate, exitDate, entryLevel, exitLevel, grossPnl, exitReason]
const SEEDS: [string, string, number, number, number, TradeRecord['exitReason'], string, string][] = [
  ['2025-01-06','2025-01-09', 24280, 24190, 4800, 'TARGET',    '09:35','15:20'],
  ['2025-01-10','2025-01-15', 24350, 24200,  3200, 'TARGET',   '09:30','14:45'],
  ['2025-01-16','2025-01-21', 24180, 24620, -2100, 'STOPLOSS', '09:40','11:15'],
  ['2025-01-22','2025-01-28', 24420, 24310,  5100, 'TARGET',   '09:30','15:30'],
  ['2025-01-29','2025-02-04', 24360, 24280,  6200, 'TARGET',   '09:35','13:00'],
  ['2025-02-05','2025-02-11', 24450, 24380,  2800, 'TARGET',   '09:30','15:10'],
  ['2025-02-12','2025-02-17', 24500, 23850, -3400, 'STOPLOSS', '09:35','10:45'],
  ['2025-02-18','2025-02-24', 24200, 24120,  4500, 'TARGET',   '09:30','14:30'],
  ['2025-02-25','2025-03-03', 24150, 24640, -1800, 'TRAILING', '09:35','13:20'],
  ['2025-03-04','2025-03-10', 24320, 24250,  5600, 'TARGET',   '09:30','15:25'],
  ['2025-03-11','2025-03-17', 24280, 24200,  3900, 'TARGET',   '09:35','12:40'],
  ['2025-03-18','2025-03-24', 24100, 23620, -2800, 'STOPLOSS', '09:30','10:55'],
  ['2025-03-25','2025-03-31', 23950, 23870,  7100, 'TARGET',   '09:35','14:50'],
  ['2025-04-01','2025-04-07', 24050, 23990,  2100, 'EOD',      '09:30','15:29'],
  ['2025-04-08','2025-04-14', 24120, 24060,  4200, 'TARGET',   '09:35','15:10'],
  ['2025-04-15','2025-04-22', 24180, 23680, -3100, 'STOPLOSS', '09:30','11:05'],
  ['2025-04-23','2025-04-29', 24250, 24170,  3800, 'TRAILING', '09:35','15:20'],
  ['2025-04-30','2025-05-06', 24350, 24280,  2500, 'TARGET',   '09:30','13:45'],
  ['2025-05-07','2025-05-13', 24420, 23960, -1500, 'TIME_EXIT','09:35','14:30'],
  ['2025-05-14','2025-05-20', 24300, 24220,  4900, 'TARGET',   '09:30','15:15'],
  ['2025-05-21','2025-05-27', 24480, 24400,  5200, 'TARGET',   '09:35','14:00'],
  ['2025-05-28','2025-06-03', 24550, 25080, -4200, 'STOPLOSS', '09:30','10:35'],
  ['2025-06-04','2025-06-10', 24600, 24520,  3300, 'TARGET',   '09:35','15:20'],
  ['2025-06-11','2025-06-14', 24520, 24470,  4500, 'TARGET',   '09:30','13:50'],
];

const INITIAL_CAPITAL = 500_000;
const BROKERAGE_PER  = 150;   // ₹ per trade
const LOT_SIZE       = 75;

// ─── Build trade records ──────────────────────────────────────────────────────

function buildTrades(): TradeRecord[] {
  return SEEDS.map(([entry, exit, eL, xL, gross, reason, eT, xT], i) => {
    const brokerage  = BROKERAGE_PER;
    const netPnl     = gross - brokerage;
    const pnlPct     = (netPnl / INITIAL_CAPITAL) * 100;
    const [ey, em, ed] = entry.split('-').map(Number);
    const [xy, xm, xd] = exit.split('-').map(Number);
    const entryMs = new Date(ey, em - 1, ed, 9, 30).getTime();
    const exitMs  = new Date(xy, xm - 1, xd, 15, 20).getTime();
    const holdingMins = Math.round((exitMs - entryMs) / 60000);
    const mfe = gross > 0 ? gross * 1.1 : Math.abs(gross) * 0.3;
    const mae = gross < 0 ? gross * 1.2 : -(Math.abs(gross) * 0.2);
    return {
      id:          i + 1,
      entryDate:   entry,
      exitDate:    exit,
      entryTime:   eT,
      exitTime:    xT,
      symbol:      'NIFTY',
      side:        'SHORT' as const,
      entryLevel:  eL,
      exitLevel:   xL,
      qty:         1,
      grossPnl:    gross,
      brokerage,
      netPnl,
      pnlPct:      parseFloat(pnlPct.toFixed(3)),
      exitReason:  reason,
      holdingMins,
      mfe:         parseFloat(mfe.toFixed(0)),
      mae:         parseFloat(mae.toFixed(0)),
    };
  });
}

// ─── Build equity curve ───────────────────────────────────────────────────────

function getTradingDays(from: string, to: string): string[] {
  const days: string[] = [];
  const cur  = new Date(from);
  const end  = new Date(to);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(cur.toISOString().slice(0, 10));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function buildEquityCurve(trades: TradeRecord[]): EquityPoint[] {
  const pnlByDate = new Map<string, number>();
  trades.forEach(t => {
    pnlByDate.set(t.exitDate, (pnlByDate.get(t.exitDate) ?? 0) + t.netPnl);
  });

  let equity = 0;
  let peak   = 0;

  return getTradingDays('2025-01-02', '2025-06-14').map(date => {
    const dayPnl = pnlByDate.get(date) ?? 0;
    equity += dayPnl;
    peak    = Math.max(peak, equity);
    return {
      date,
      equity:    parseFloat(equity.toFixed(2)),
      drawdown:  parseFloat((equity - peak).toFixed(2)),
      tradeExit: pnlByDate.has(date),
    };
  });
}

// ─── Monthly aggregation ──────────────────────────────────────────────────────

const MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildMonthlyReturns(trades: TradeRecord[]): MonthlyReturn[] {
  const map = new Map<string, MonthlyReturn>();
  trades.forEach(t => {
    const [y, m] = t.exitDate.split('-').map(Number);
    const key = `${y}-${m}`;
    const prev = map.get(key) ?? {
      year: y, month: m,
      label: `${MONTH_LABELS[m]} ${String(y).slice(2)}`,
      netPnl: 0, pnlPct: 0, trades: 0, wins: 0,
    };
    prev.netPnl  += t.netPnl;
    prev.pnlPct  += t.pnlPct;
    prev.trades  += 1;
    prev.wins    += t.netPnl > 0 ? 1 : 0;
    map.set(key, prev);
  });
  return Array.from(map.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month,
  );
}

// ─── Aggregate metrics ────────────────────────────────────────────────────────

function buildMetrics(trades: TradeRecord[], curve: EquityPoint[]): BacktestMetrics {
  const winners = trades.filter(t => t.netPnl > 0);
  const losers  = trades.filter(t => t.netPnl < 0);

  const grossPnl    = trades.reduce((s, t) => s + t.grossPnl, 0);
  const brokerage   = trades.reduce((s, t) => s + t.brokerage, 0);
  const netPnl      = grossPnl - brokerage;

  const grossWins   = winners.reduce((s, t) => s + t.grossPnl, 0);
  const grossLosses = Math.abs(losers.reduce((s, t) => s + t.grossPnl, 0));

  const maxDD       = Math.min(...curve.map(p => p.drawdown));
  const peakEquity  = Math.max(...curve.map(p => p.equity));

  // Recovery days: find how many days from max DD trough to next peak
  const troughIdx = curve.findIndex(p => p.drawdown === maxDD);
  const recoverIdx = curve.slice(troughIdx).findIndex(p => p.drawdown === 0);
  const recoveryDays = recoverIdx === -1 ? 0 : recoverIdx;

  const avgWin  = winners.length ? grossWins / winners.length  : 0;
  const avgLoss = losers.length  ? grossLosses / losers.length : 0;
  const winRate = (winners.length / trades.length) * 100;
  const lossRate = 100 - winRate;

  // Sharpe (simplified — daily P&L std dev)
  const dailyPnls = curve.filter(p => p.tradeExit).map(p => p.drawdown);
  const mean = dailyPnls.length ? dailyPnls.reduce((a, b) => a + b, 0) / dailyPnls.length : 0;
  const variance = dailyPnls.length
    ? dailyPnls.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyPnls.length
    : 1;
  const sharpe = variance > 0 ? (netPnl / trades.length) / Math.sqrt(variance) : 0;

  // Consecutive streaks
  let maxCW = 0, maxCL = 0, curW = 0, curL = 0;
  trades.forEach(t => {
    if (t.netPnl > 0) { curW++; maxCW = Math.max(maxCW, curW); curL = 0; }
    else               { curL++; maxCL = Math.max(maxCL, curL); curW = 0; }
  });

  return {
    grossPnl:          parseFloat(grossPnl.toFixed(2)),
    totalBrokerage:    parseFloat(brokerage.toFixed(2)),
    netPnl:            parseFloat(netPnl.toFixed(2)),
    absoluteReturnPct: parseFloat(((netPnl / INITIAL_CAPITAL) * 100).toFixed(2)),
    annualizedRetPct:  parseFloat(((netPnl / INITIAL_CAPITAL) * 100 * (365 / 165)).toFixed(2)),
    totalTrades:       trades.length,
    winningTrades:     winners.length,
    losingTrades:      losers.length,
    breakEven:         trades.filter(t => t.netPnl === 0).length,
    winRate:           parseFloat(winRate.toFixed(1)),
    profitFactor:      grossLosses > 0 ? parseFloat((grossWins / grossLosses).toFixed(2)) : 0,
    avgTrade:          parseFloat((netPnl / trades.length).toFixed(2)),
    avgWin:            parseFloat(avgWin.toFixed(2)),
    avgLoss:           parseFloat((-avgLoss).toFixed(2)),
    expectancy:        parseFloat(((winRate / 100) * avgWin - (lossRate / 100) * avgLoss).toFixed(2)),
    maxDrawdown:       parseFloat(maxDD.toFixed(2)),
    maxDrawdownPct:    parseFloat(((maxDD / INITIAL_CAPITAL) * 100).toFixed(2)),
    recoveryDays,
    sharpeRatio:       parseFloat(Math.abs(sharpe * 10).toFixed(2)),
    sortinoRatio:      parseFloat((Math.abs(sharpe * 10) * 1.18).toFixed(2)),
    calmarRatio:       maxDD !== 0 ? parseFloat((netPnl / Math.abs(maxDD)).toFixed(2)) : 0,
    maxConsecWins:     maxCW,
    maxConsecLosses:   maxCL,
    avgHoldingMins:    Math.round(trades.reduce((s, t) => s + t.holdingMins, 0) / trades.length),
    initialCapital:    INITIAL_CAPITAL,
    peakCapital:       INITIAL_CAPITAL + peakEquity,
    finalCapital:      INITIAL_CAPITAL + netPnl,
  };
}

// ─── Assemble the full mock result ────────────────────────────────────────────

function buildMockResult(): BacktestResult {
  const trades  = buildTrades();
  const curve   = buildEquityCurve(trades);
  const monthly = buildMonthlyReturns(trades);
  const metrics = buildMetrics(trades, curve);

  return {
    id:     'bt_mock_001',
    status: 'completed',
    runAt:  '2025-06-15T10:32:00+05:30',
    durationMs: 1420,
    config: {
      strategyId:      'strat_001',
      strategyName:    'NIFTY Iron Condor — Weekly',
      symbol:          'NIFTY',
      exchange:        'NSE',
      fromDate:        '2025-01-02',
      toDate:          '2025-06-14',
      timeframe:       '1D',
      initialCapital:  INITIAL_CAPITAL,
      slippagePct:     0.05,
      brokeragePerLot: BROKERAGE_PER,
      category:        'neutral',
    },
    metrics,
    equityCurve:    curve,
    monthlyReturns: monthly,
    trades,
  };
}

// Export a singleton so the data is generated once
export const MOCK_BACKTEST_RESULT: BacktestResult = buildMockResult();
