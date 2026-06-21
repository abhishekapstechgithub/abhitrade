"""
MetricsCalculator — computes all 20 performance statistics from a trade list.

Input:  list[Trade], initial_capital
Output: dict with all metrics + equity_curve + monthly_returns
"""

from __future__ import annotations
import math
from collections import defaultdict
from datetime import date
from .strategy.base import Trade


class MetricsCalculator:

    def __init__(self, trades: list[Trade], initial_capital: float):
        self.trades          = trades
        self.initial_capital = initial_capital

    def compute(self) -> dict:
        trades = self.trades
        if not trades:
            return self._empty()

        wins  = [t for t in trades if t.pnl > 0]
        losses = [t for t in trades if t.pnl <= 0]

        total_pnl     = sum(t.pnl for t in trades)
        gross_profit  = sum(t.pnl for t in wins)
        gross_loss    = abs(sum(t.pnl for t in losses))

        win_rate = len(wins) / len(trades) * 100 if trades else 0.0
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")
        avg_win  = gross_profit / len(wins)  if wins   else 0.0
        avg_loss = gross_loss   / len(losses) if losses else 0.0

        equity_curve  = self._equity_curve(trades)
        max_dd, max_dd_pct = self._max_drawdown(equity_curve)
        sharpe        = self._sharpe(trades)
        sortino       = self._sortino(trades)
        calmar        = self._calmar(total_pnl, max_dd)

        monthly       = self._monthly_returns(trades)
        best_month    = max(monthly.values(), default=0.0)
        worst_month   = min(monthly.values(), default=0.0)

        avg_hold_days = self._avg_hold_days(trades)
        longest_win   = self._streak(trades, win=True)
        longest_loss  = self._streak(trades, win=False)
        expectancy    = (win_rate / 100 * avg_win) - ((1 - win_rate / 100) * avg_loss)
        recovery_factor = total_pnl / abs(max_dd) if max_dd != 0 else 0.0

        final_equity = self.initial_capital + total_pnl
        total_return_pct = (total_pnl / self.initial_capital) * 100

        return {
            # Core P&L
            "totalPnl":          round(total_pnl, 2),
            "totalReturnPct":    round(total_return_pct, 2),
            "grossProfit":       round(gross_profit, 2),
            "grossLoss":         round(gross_loss, 2),
            "finalEquity":       round(final_equity, 2),
            # Trade stats
            "totalTrades":       len(trades),
            "winningTrades":     len(wins),
            "losingTrades":      len(losses),
            "winRate":           round(win_rate, 2),
            "profitFactor":      round(profit_factor, 4) if profit_factor != float("inf") else 9999.0,
            "avgWin":            round(avg_win, 2),
            "avgLoss":           round(avg_loss, 2),
            "expectancy":        round(expectancy, 2),
            "longestWinStreak":  longest_win,
            "longestLossStreak": longest_loss,
            # Risk
            "maxDrawdown":       round(max_dd, 2),
            "maxDrawdownPct":    round(max_dd_pct, 2),
            "sharpeRatio":       round(sharpe, 4),
            "sortinoRatio":      round(sortino, 4),
            "calmarRatio":       round(calmar, 4),
            "recoveryFactor":    round(recovery_factor, 4),
            # Duration
            "avgHoldDays":       round(avg_hold_days, 1),
            "bestMonth":         round(best_month, 2),
            "worstMonth":        round(worst_month, 2),
            # Curve data
            "equityCurve":       equity_curve,
            "monthlyReturns":    self._monthly_matrix(monthly),
        }

    # ── curve ────────────────────────────────────────────────────────────────

    def _equity_curve(self, trades: list[Trade]) -> list[dict]:
        equity = self.initial_capital
        curve = [{"x": trades[0].entry_time.strftime("%Y-%m-%d"), "y": round(equity, 2)}]
        for t in trades:
            equity += t.pnl
            dd = self._running_dd(curve, equity)
            curve.append({
                "x":        t.exit_time.strftime("%Y-%m-%dT%H:%M:%S"),
                "y":        round(equity, 2),
                "drawdown": round(dd, 2),
                "tradeId":  t.trade_id,
            })
        return curve

    def _running_dd(self, curve: list[dict], current_equity: float) -> float:
        peak = max(p["y"] for p in curve)
        return (current_equity - peak) / peak * 100 if peak > 0 else 0.0

    def _max_drawdown(self, curve: list[dict]) -> tuple[float, float]:
        if not curve:
            return 0.0, 0.0
        peak = curve[0]["y"]
        max_dd = 0.0
        max_dd_pct = 0.0
        for p in curve:
            if p["y"] > peak:
                peak = p["y"]
            dd = peak - p["y"]
            dd_pct = dd / peak * 100 if peak > 0 else 0.0
            if dd > max_dd:
                max_dd = dd
                max_dd_pct = dd_pct
        return max_dd, max_dd_pct

    # ── risk ratios ──────────────────────────────────────────────────────────

    def _daily_returns(self, trades: list[Trade]) -> list[float]:
        """Aggregate P&L by exit date, divide by initial capital → daily return %."""
        by_date: dict[date, float] = defaultdict(float)
        for t in trades:
            by_date[t.exit_time.date()] += t.pnl
        returns = [v / self.initial_capital * 100 for v in sorted(by_date.values())]
        return returns

    def _sharpe(self, trades: list[Trade], rf_annual: float = 6.5) -> float:
        """Annualised Sharpe using daily returns, risk-free rate = 6.5% p.a."""
        rets = self._daily_returns(trades)
        if len(rets) < 2:
            return 0.0
        rf_daily = rf_annual / 252 / 100
        excess   = [r / 100 - rf_daily for r in rets]
        mean     = sum(excess) / len(excess)
        std      = (sum((x - mean) ** 2 for x in excess) / (len(excess) - 1)) ** 0.5
        return (mean / std * math.sqrt(252)) if std > 0 else 0.0

    def _sortino(self, trades: list[Trade], rf_annual: float = 6.5) -> float:
        rets = self._daily_returns(trades)
        if len(rets) < 2:
            return 0.0
        rf_daily = rf_annual / 252 / 100
        excess   = [r / 100 - rf_daily for r in rets]
        mean     = sum(excess) / len(excess)
        downside = [x for x in excess if x < 0]
        if not downside:
            return 0.0
        semi_std = (sum(x ** 2 for x in downside) / len(downside)) ** 0.5
        return (mean / semi_std * math.sqrt(252)) if semi_std > 0 else 0.0

    def _calmar(self, total_pnl: float, max_dd: float) -> float:
        if max_dd == 0:
            return 0.0
        annual_return = total_pnl / self.initial_capital * 100
        return annual_return / (max_dd / self.initial_capital * 100)

    # ── monthly ──────────────────────────────────────────────────────────────

    def _monthly_returns(self, trades: list[Trade]) -> dict[str, float]:
        by_month: dict[str, float] = defaultdict(float)
        for t in trades:
            key = t.exit_time.strftime("%Y-%m")
            by_month[key] += t.pnl
        return dict(by_month)

    def _monthly_matrix(self, monthly: dict[str, float]) -> list[dict]:
        """Convert {YYYY-MM: pnl} → [{year, month, pnl, pct}] for frontend grid."""
        rows = []
        for key, pnl in sorted(monthly.items()):
            year, month = key.split("-")
            rows.append({
                "year":  int(year),
                "month": int(month),
                "pnl":   round(pnl, 2),
                "pct":   round(pnl / self.initial_capital * 100, 2),
            })
        return rows

    # ── helpers ──────────────────────────────────────────────────────────────

    def _avg_hold_days(self, trades: list[Trade]) -> float:
        if not trades:
            return 0.0
        durations = [(t.exit_time - t.entry_time).total_seconds() / 86400 for t in trades]
        return sum(durations) / len(durations)

    def _streak(self, trades: list[Trade], win: bool) -> int:
        best = cur = 0
        for t in trades:
            if (t.pnl > 0) == win:
                cur += 1
                best = max(best, cur)
            else:
                cur = 0
        return best

    def _empty(self) -> dict:
        return {
            "totalPnl": 0.0, "totalReturnPct": 0.0, "grossProfit": 0.0,
            "grossLoss": 0.0, "finalEquity": self.initial_capital,
            "totalTrades": 0, "winningTrades": 0, "losingTrades": 0,
            "winRate": 0.0, "profitFactor": 0.0, "avgWin": 0.0,
            "avgLoss": 0.0, "expectancy": 0.0,
            "longestWinStreak": 0, "longestLossStreak": 0,
            "maxDrawdown": 0.0, "maxDrawdownPct": 0.0,
            "sharpeRatio": 0.0, "sortinoRatio": 0.0, "calmarRatio": 0.0,
            "recoveryFactor": 0.0, "avgHoldDays": 0.0,
            "bestMonth": 0.0, "worstMonth": 0.0,
            "equityCurve": [], "monthlyReturns": [],
        }
