"""
Strategy request/response schemas.
Field names use camelCase aliases so the JSON output is consumed directly
by the TypeScript frontend without any mapping.
"""

from __future__ import annotations
from datetime import datetime
from typing import Literal, Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


# ─── Enumerations ─────────────────────────────────────────────────────────────

StrategyCategory = Literal["bullish", "bearish", "neutral", "hedged", "income"]
StrategyStatus   = Literal["saved", "deployed", "simulating", "expired"]
OptionType       = Literal["CE", "PE"]
LegAction        = Literal["BUY", "SELL"]
Exchange         = Literal["NSE", "BSE"]


# ─── Leg ──────────────────────────────────────────────────────────────────────

class StrategyLegBase(BaseModel):
    action:      LegAction
    option_type: OptionType = Field(alias="optionType")
    strike:      float      = Field(gt=0)
    expiry:      str        = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    lots:        int        = Field(ge=1)
    premium:     float      = Field(ge=0)
    iv:          float | None = None
    delta:       float | None = None
    theta:       float | None = None

    model_config = {"populate_by_name": True}


class StrategyLegIn(StrategyLegBase):
    id: str | None = None   # client may send an id; we generate one server-side


class StrategyLegOut(StrategyLegBase):
    id: str


# ─── Strategy — Create ────────────────────────────────────────────────────────

class CreateStrategyRequest(BaseModel):
    name:           str            = Field(min_length=1, max_length=150)
    symbol:         str            = Field(min_length=1, max_length=100)
    exchange:       Exchange       = "NSE"
    category:       StrategyCategory
    status:         StrategyStatus = "saved"
    legs:           list[StrategyLegIn] = Field(min_length=1, max_length=20)
    max_profit:     float | None   = Field(None, alias="maxProfit")
    max_loss:       float | None   = Field(None, alias="maxLoss")
    breakeven_low:  float | None   = Field(None, alias="breakevenLow")
    breakeven_high: float | None   = Field(None, alias="breakevenHigh")
    net_premium:    float          = Field(0.0, alias="netPremium")
    tags:           list[str]      = []
    notes:          str | None     = None
    builder_json:   dict[str, Any] | None = Field(None, alias="builderJson")

    model_config = {"populate_by_name": True}

    @field_validator("tags", mode="before")
    @classmethod
    def clean_tags(cls, v: Any) -> list[str]:
        if isinstance(v, list):
            return [t.strip() for t in v if isinstance(t, str) and t.strip()]
        return []


# ─── Strategy — Update ────────────────────────────────────────────────────────

class UpdateStrategyRequest(BaseModel):
    """All fields optional — PATCH semantics."""
    name:           str | None              = Field(None, min_length=1, max_length=150)
    symbol:         str | None              = Field(None, min_length=1, max_length=100)
    exchange:       Exchange | None         = None
    category:       StrategyCategory | None = None
    status:         StrategyStatus | None   = None
    legs:           list[StrategyLegIn] | None = None
    max_profit:     float | None            = Field(None, alias="maxProfit")
    max_loss:       float | None            = Field(None, alias="maxLoss")
    breakeven_low:  float | None            = Field(None, alias="breakevenLow")
    breakeven_high: float | None            = Field(None, alias="breakevenHigh")
    net_premium:    float | None            = Field(None, alias="netPremium")
    tags:           list[str] | None        = None
    notes:          str | None              = None
    builder_json:   dict[str, Any] | None  = Field(None, alias="builderJson")

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def at_least_one_field(self) -> "UpdateStrategyRequest":
        if all(v is None for v in self.model_dump().values()):
            raise ValueError("At least one field must be provided for update")
        return self


# ─── Strategy — Response ──────────────────────────────────────────────────────

class StrategyOut(BaseModel):
    id:             UUID
    name:           str
    symbol:         str
    exchange:       Exchange
    category:       StrategyCategory
    status:         StrategyStatus
    legs:           list[StrategyLegOut]
    max_profit:     float | None = Field(alias="maxProfit")
    max_loss:       float | None = Field(alias="maxLoss")
    breakeven_low:  float | None = Field(alias="breakevenLow")
    breakeven_high: float | None = Field(alias="breakevenHigh")
    net_premium:    float        = Field(alias="netPremium")
    tags:           list[str]    = []
    notes:          str | None   = None
    created_at:     datetime     = Field(alias="createdAt")
    updated_at:     datetime     = Field(alias="updatedAt")

    model_config = {
        "populate_by_name": True,
        "from_attributes":  True,
    }


# ─── Import from builder JSON ─────────────────────────────────────────────────

class ImportBuilderRequest(BaseModel):
    builder_json: dict[str, Any] = Field(alias="builderJson")
    strategy_id:  UUID | None    = Field(None, alias="strategyId")

    model_config = {"populate_by_name": True}


# ─── Deploy response ──────────────────────────────────────────────────────────

class DeployResponseData(BaseModel):
    strategy:    StrategyOut
    basket_id:   str       = Field(alias="basketId")
    deployed_at: datetime  = Field(alias="deployedAt")

    model_config = {"populate_by_name": True}


# ─── List params (query string) ───────────────────────────────────────────────

class StrategyListParams(BaseModel):
    page:      int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100, alias="pageSize")
    category:  StrategyCategory | Literal["all"] = "all"
    status:    StrategyStatus   | Literal["all"] = "all"
    symbol:    str = ""
    exchange:  Exchange | Literal["all"] = "all"
    q:         str = ""
    sort_by:   Literal["createdAt", "updatedAt", "name", "netPremium"] = "createdAt"
    order:     Literal["asc", "desc"] = "desc"

    model_config = {"populate_by_name": True}
