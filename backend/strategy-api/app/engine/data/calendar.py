"""
Indian market trading calendar.

Provides:
  - is_trading_day(d)       — True for Mon–Fri non-holidays
  - trading_days(from, to)  — list of valid session dates
  - weekly_expiries(...)    — NSE weekly option expiries (Thursday)
  - monthly_expiries(...)   — last Thursday of each month
  - next_expiry(d, freq)    — nearest expiry on or after d

NSE holidays are hardcoded for 2024–2026. Replace with a DB lookup when
the full NSE holiday master is available.
"""

from __future__ import annotations
from datetime import date, timedelta
from functools import lru_cache

# ─── NSE market holidays 2024–2026 ───────────────────────────────────────────
# Source: NSE circular. Add future years here as they are announced.

_NSE_HOLIDAYS: frozenset[date] = frozenset({
    # 2024
    date(2024, 1, 22),   # Ram Lalla Prana Pratishtha
    date(2024, 1, 26),   # Republic Day
    date(2024, 3, 25),   # Holi
    date(2024, 3, 29),   # Good Friday
    date(2024, 4, 14),   # Dr. Ambedkar Jayanti / Ram Navami
    date(2024, 4, 17),   # Ram Navami (holiday declared)
    date(2024, 4, 21),   # Gudi Padwa (Maharashtra)
    date(2024, 5, 23),   # Buddha Purnima
    date(2024, 6, 17),   # Bakri Id (Eid al-Adha)
    date(2024, 7, 17),   # Muharram
    date(2024, 8, 15),   # Independence Day
    date(2024, 10, 2),   # Gandhi Jayanti / Mahatma Gandhi
    date(2024, 11, 1),   # Diwali Laxmi Pujan
    date(2024, 11, 15),  # Gurunanak Jayanti
    date(2024, 12, 25),  # Christmas
    # 2025
    date(2025, 2, 26),   # Mahashivratri
    date(2025, 3, 14),   # Holi
    date(2025, 3, 31),   # Id-Ul-Fitr (Ramzan Eid)
    date(2025, 4, 10),   # Shri Ram Navami
    date(2025, 4, 14),   # Dr. B. R. Ambedkar Jayanti
    date(2025, 4, 18),   # Good Friday
    date(2025, 5, 12),   # Buddha Purnima
    date(2025, 6, 7),    # Id-Ul-Adha (Bakri Id)
    date(2025, 6, 27),   # Muharram
    date(2025, 8, 15),   # Independence Day
    date(2025, 8, 27),   # Ganesh Chaturthi
    date(2025, 10, 2),   # Mahatma Gandhi Jayanti / Dussehra
    date(2025, 10, 20),  # Diwali Laxmi Pujan
    date(2025, 10, 21),  # Diwali (Laxmi Pujan balipratipada)
    date(2025, 11, 5),   # Prakash Gurpurb Sri Guru Nanak Dev
    date(2025, 12, 25),  # Christmas
    # 2026 (estimated — update when NSE announces)
    date(2026, 1, 26),   # Republic Day
    date(2026, 3, 3),    # Holi
    date(2026, 3, 20),   # Gudi Padwa (estimated)
    date(2026, 4, 3),    # Good Friday
    date(2026, 4, 14),   # Dr. Ambedkar Jayanti
    date(2026, 5, 1),    # Maharashtra Day
    date(2026, 8, 15),   # Independence Day
    date(2026, 10, 2),   # Gandhi Jayanti
    date(2026, 11, 9),   # Diwali (estimated)
    date(2026, 12, 25),  # Christmas
})


def is_trading_day(d: date) -> bool:
    """True if `d` is a weekday and not a NSE market holiday."""
    return d.weekday() < 5 and d not in _NSE_HOLIDAYS


def trading_days(from_date: date | str, to_date: date | str) -> list[date]:
    """All valid NSE trading days in [from_date, to_date]."""
    if isinstance(from_date, str):
        from_date = date.fromisoformat(from_date)
    if isinstance(to_date, str):
        to_date = date.fromisoformat(to_date)

    days: list[date] = []
    cur = from_date
    while cur <= to_date:
        if is_trading_day(cur):
            days.append(cur)
        cur += timedelta(days=1)
    return days


def weekly_expiries(from_date: date | str, to_date: date | str) -> list[date]:
    """All NSE weekly option expiry dates (Thursdays) in range.
    If Thursday is a holiday, the expiry moves to Wednesday.
    """
    if isinstance(from_date, str):
        from_date = date.fromisoformat(from_date)
    if isinstance(to_date, str):
        to_date = date.fromisoformat(to_date)

    result: list[date] = []
    cur = from_date
    while cur <= to_date:
        if cur.weekday() == 3:   # Thursday
            expiry = cur if is_trading_day(cur) else cur - timedelta(days=1)
            if from_date <= expiry <= to_date:
                result.append(expiry)
        cur += timedelta(days=1)
    return result


def monthly_expiries(from_date: date | str, to_date: date | str) -> list[date]:
    """Last Thursday of each calendar month (NSE monthly expiry).
    Falls back to Wednesday if Thursday is a holiday.
    """
    thursdays = weekly_expiries(from_date, to_date)

    last_of_month: dict[tuple[int, int], date] = {}
    for t in thursdays:
        key = (t.year, t.month)
        if key not in last_of_month or t > last_of_month[key]:
            last_of_month[key] = t

    return sorted(last_of_month.values())


def next_expiry(
    ref: date,
    freq: str = "weekly",        # "weekly" | "monthly"
    same_day: bool = True,
) -> date | None:
    """Return the nearest expiry on or after `ref`."""
    look_ahead = ref + timedelta(days=0 if same_day else 1)
    to_date    = ref + timedelta(days=60)

    expiries = (
        weekly_expiries(look_ahead, to_date)
        if freq == "weekly"
        else monthly_expiries(look_ahead, to_date)
    )
    return expiries[0] if expiries else None


def prev_trading_day(d: date) -> date:
    """Return the most recent trading day before `d`."""
    cur = d - timedelta(days=1)
    while not is_trading_day(cur):
        cur -= timedelta(days=1)
    return cur


def session_start() -> str:
    return "09:15"


def session_end() -> str:
    return "15:30"
