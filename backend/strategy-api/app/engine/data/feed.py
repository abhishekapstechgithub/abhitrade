"""
DataFeed — pluggable market data source.

The engine calls feed.get_candles() and receives a list[Candle].
Concrete implementations:

  GBMFeed   — synthetic GBM price walk (always available, used for dev/test)
  CSVFeed   — loads OHLCV from a CSV file
  DBFeed    — queries the PostgreSQL security_master / a candles table (stub)

Adding a new data source = subclass DataFeed, implement get_candles().
"""

from __future__ import annotations
import csv
import math
import random
from abc import ABC, abstractmethod
from datetime import date, datetime, time, timedelta
from pathlib import Path

from .candle import Candle, CandleSeries
from .calendar import trading_days


# ─── Base ─────────────────────────────────────────────────────────────────────

class DataFeed(ABC):
    @abstractmethod
    def get_candles(
        self,
        symbol:    str,
        from_date: date | str,
        to_date:   date | str,
        timeframe: str = "1D",
    ) -> CandleSeries:
        """Return OHLCV candles sorted ascending by timestamp."""

    def _normalise_dates(
        self, from_date: date | str, to_date: date | str
    ) -> tuple[date, date]:
        if isinstance(from_date, str):
            from_date = date.fromisoformat(from_date)
        if isinstance(to_date, str):
            to_date = date.fromisoformat(to_date)
        return from_date, to_date


# ─── GBM synthetic feed ───────────────────────────────────────────────────────

# Base prices and intraday volatility scaling for major NSE symbols
_SYMBOL_PARAMS: dict[str, dict] = {
    "NIFTY":       {"base": 23_500.0,  "vol": 0.14, "drift": 0.10},
    "BANKNIFTY":   {"base": 50_000.0,  "vol": 0.18, "drift": 0.10},
    "SENSEX":      {"base": 80_000.0,  "vol": 0.13, "drift": 0.10},
    "NIFTYMIDCAP": {"base": 12_000.0,  "vol": 0.20, "drift": 0.12},
    "FINNIFTY":    {"base": 22_000.0,  "vol": 0.17, "drift": 0.10},
    "NIFTYNXT50":  {"base": 67_000.0,  "vol": 0.16, "drift": 0.11},
    # Liquid F&O stocks
    "RELIANCE":    {"base": 2_900.0,   "vol": 0.25, "drift": 0.12},
    "HDFCBANK":    {"base": 1_750.0,   "vol": 0.22, "drift": 0.09},
    "INFY":        {"base": 1_900.0,   "vol": 0.28, "drift": 0.11},
    "TCS":         {"base": 4_200.0,   "vol": 0.22, "drift": 0.10},
}

_TIMEFRAME_MINUTES = {
    "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60,
    "1D": 375,   # full session in minutes
    "1W": 375 * 5,
}


class GBMFeed(DataFeed):
    """
    Generates synthetic but realistic OHLCV bars using Geometric Brownian Motion.

    The same symbol+from_date combination always produces the same price path
    (deterministic seed) so backtests are reproducible.
    """

    def get_candles(
        self,
        symbol:    str,
        from_date: date | str,
        to_date:   date | str,
        timeframe: str = "1D",
    ) -> CandleSeries:
        from_date, to_date = self._normalise_dates(from_date, to_date)
        params = _SYMBOL_PARAMS.get(symbol.upper(), {"base": 20_000.0, "vol": 0.18, "drift": 0.10})

        base    = params["base"]
        sigma   = params["vol"]
        mu      = params["drift"]
        seed    = hash(f"{symbol}:{from_date.isoformat()}")
        rng     = random.Random(seed)

        days    = trading_days(from_date, to_date)
        if not days:
            return []

        tf_mins = _TIMEFRAME_MINUTES.get(timeframe, 375)
        dt      = tf_mins / (252 * 375)   # fraction of a trading year per bar

        # Generate the underlying close price series
        closes: list[float] = [base]
        for _ in range(len(days) - 1):
            z     = rng.gauss(0, 1)
            price = closes[-1] * math.exp((mu - 0.5 * sigma**2) * dt + sigma * math.sqrt(dt) * z)
            closes.append(round(price, 2))

        candles: CandleSeries = []
        for idx, (d, close) in enumerate(zip(days, closes)):
            # Build realistic OHLC from the close
            daily_range = close * sigma * math.sqrt(1 / 252) * rng.uniform(0.8, 1.6)
            high  = round(close + daily_range * rng.uniform(0.3, 0.7), 2)
            low   = round(close - daily_range * rng.uniform(0.3, 0.7), 2)
            open_ = round(
                closes[idx - 1] * (1 + rng.gauss(0, sigma * math.sqrt(dt) * 0.3))
                if idx > 0 else close,
                2,
            )
            high  = max(high, open_, close)
            low   = min(low, open_, close)

            vol   = int(rng.uniform(500_000, 5_000_000))
            ts    = datetime.combine(d, time(9, 15))

            candles.append(Candle(
                timestamp=ts,
                date=d,
                symbol=symbol,
                timeframe=timeframe,
                open=open_,
                high=high,
                low=low,
                close=close,
                volume=vol,
                index=idx,
            ))

        return candles


# ─── CSV feed ─────────────────────────────────────────────────────────────────

class CSVFeed(DataFeed):
    """
    Load OHLCV from a CSV file.

    Expected column names (case-insensitive):
        date, open, high, low, close, volume
    Optional: oi, iv

    The date column must be parseable as YYYY-MM-DD or DD-MM-YYYY.
    """

    def __init__(self, file_path: str | Path, symbol: str = "", timeframe: str = "1D"):
        self._path     = Path(file_path)
        self._symbol   = symbol
        self._timeframe = timeframe
        self._cache: CandleSeries | None = None

    def _load(self) -> CandleSeries:
        if self._cache is not None:
            return self._cache

        candles: CandleSeries = []
        with open(self._path, newline="") as f:
            reader = csv.DictReader(f)
            headers = {h.strip().lower(): h for h in (reader.fieldnames or [])}

            for idx, row in enumerate(reader):
                raw_date = row.get(headers.get("date", "date"), "").strip()
                try:
                    d = date.fromisoformat(raw_date)
                except ValueError:
                    parts = raw_date.split("-")
                    d = date(int(parts[2]), int(parts[1]), int(parts[0]))

                candles.append(Candle(
                    timestamp=datetime.combine(d, time(9, 15)),
                    date=d,
                    symbol=self._symbol,
                    timeframe=self._timeframe,
                    open=float(row.get(headers.get("open",  "open"),  0)),
                    high=float(row.get(headers.get("high",  "high"),  0)),
                    low= float(row.get(headers.get("low",   "low"),   0)),
                    close=float(row.get(headers.get("close","close"), 0)),
                    volume=int(float(row.get(headers.get("volume","volume"), 0))),
                    oi=int(float(row.get(headers.get("oi","oi"), 0) or 0)),
                    iv=float(row.get(headers.get("iv","iv"), 0) or 0),
                    index=idx,
                ))

        self._cache = sorted(candles, key=lambda c: c.date)
        return self._cache

    def get_candles(
        self,
        symbol:    str,
        from_date: date | str,
        to_date:   date | str,
        timeframe: str = "1D",
    ) -> CandleSeries:
        from_date, to_date = self._normalise_dates(from_date, to_date)
        all_candles = self._load()
        return [c for c in all_candles if from_date <= c.date <= to_date]


# ─── DB feed stub ─────────────────────────────────────────────────────────────

class DBFeed(DataFeed):
    """
    Loads candles from the PostgreSQL `candles` table (not yet created).
    This is a stub — implement when the candle ingestion pipeline is built.
    """

    def __init__(self, conn):   # asyncpg.Connection passed in
        self._conn = conn

    def get_candles(
        self,
        symbol:    str,
        from_date: date | str,
        to_date:   date | str,
        timeframe: str = "1D",
    ) -> CandleSeries:
        raise NotImplementedError(
            "DBFeed requires an async context. "
            "Use 'await db_feed.get_candles_async(...)' instead."
        )

    async def get_candles_async(
        self,
        symbol:    str,
        from_date: date | str,
        to_date:   date | str,
        timeframe: str = "1D",
    ) -> CandleSeries:
        from_date, to_date = self._normalise_dates(from_date, to_date)
        rows = await self._conn.fetch(
            """
            SELECT date, open, high, low, close, volume, oi, iv
            FROM candles
            WHERE symbol = $1 AND timeframe = $2
              AND date BETWEEN $3 AND $4
            ORDER BY date ASC
            """,
            symbol, timeframe, from_date, to_date,
        )
        return [
            Candle(
                timestamp=datetime.combine(r["date"], time(9, 15)),
                date=r["date"],
                symbol=symbol,
                timeframe=timeframe,
                open=float(r["open"]),
                high=float(r["high"]),
                low=float(r["low"]),
                close=float(r["close"]),
                volume=int(r["volume"] or 0),
                oi=int(r["oi"] or 0),
                iv=float(r["iv"] or 0),
                index=i,
            )
            for i, r in enumerate(rows)
        ]
