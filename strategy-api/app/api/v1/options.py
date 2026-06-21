"""
Option chain Greeks endpoint.
POST /api/options/chain-greeks  →  fetch + cache Angel One option Greeks
GET  /api/options/chain-greeks  →  read from Postgres (off-hours fallback)
"""

from datetime import datetime

import pytz
from fastapi import APIRouter
from pydantic import BaseModel, field_validator

from ...dependencies import DBConn, CurrentUser
from ...services.option_greeks import get_option_greeks, get_greeks_from_db, _parse_expiry

router = APIRouter(prefix="/options", tags=["options"])

_IST = pytz.timezone("Asia/Kolkata")


class GreeksRequest(BaseModel):
    name:       str   # underlying symbol, e.g. "NIFTY", "TCS"
    expirydate: str   # Angel One format: "25JAN2024"

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError("name cannot be empty")
        return v

    @field_validator("expirydate")
    @classmethod
    def clean_expiry(cls, v: str) -> str:
        return v.strip().upper()


@router.post("/chain-greeks")
async def fetch_option_greeks(
    body: GreeksRequest,
    conn: DBConn,
    user_id: CurrentUser,
) -> dict:
    """
    Returns full option chain Greeks for the given underlying + expiry.
    - Checks Redis first (5-min TTL during market hours, 1-hour off-hours)
    - On miss: calls Angel One SmartAPI → upserts Postgres → caches Redis
    """
    records = await get_option_greeks(body.name, body.expirydate, conn)

    # Group into CE / PE chain for easier frontend consumption
    ce_chain = sorted([r for r in records if str(r.get("optionType","")).upper() == "CE"],
                      key=lambda x: float(x.get("strikePrice", 0) or 0))
    pe_chain = sorted([r for r in records if str(r.get("optionType","")).upper() == "PE"],
                      key=lambda x: float(x.get("strikePrice", 0) or 0))

    return {
        "underlying":  body.name,
        "expirydate":  body.expirydate,
        "total_strikes": len(set(r.get("strikePrice") for r in records)),
        "ce_chain":    ce_chain,
        "pe_chain":    pe_chain,
        "raw":         records,
        "source":      "angel_one",
        "timestamp":   datetime.now(_IST).isoformat(),
    }


@router.get("/chain-greeks")
async def get_cached_option_greeks(
    name: str,
    expiry: str,
    conn: DBConn,
    user_id: CurrentUser,
) -> dict:
    """
    Read Greeks from PostgreSQL (for off-hours analysis or audit).
    query params: name=NIFTY&expiry=2024-01-25 (ISO date)
    """
    try:
        expiry_date = _parse_expiry(expiry)
    except ValueError:
        from ...exceptions import AppError
        raise AppError(f"Invalid expiry date format: {expiry!r}", status_code=400, code="INVALID_EXPIRY")

    rows = await get_greeks_from_db(conn, name.upper(), expiry_date)

    return {
        "underlying": name.upper(),
        "expiry":     expiry_date.isoformat(),
        "count":      len(rows),
        "records":    rows,
        "source":     "postgres",
    }
