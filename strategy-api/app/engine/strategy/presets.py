"""
Preset option strategies — Iron Condor, Bull Call Spread, Bear Put Spread, Strangle.

Each preset is a Strategy subclass that uses OptionChain to pick strikes
and OptionLeg objects to track entries/exits.

These are used directly when the builder JSON has type='preset_strategy'.
"""

from __future__ import annotations
from datetime import date
from ..data.candle import Candle, CandleSeries
from ..data.calendar import next_expiry
from ..options.chain import OptionChain
from ..options.leg import OptionLeg, LegStatus
from .base import Strategy, Trade


def _days_to_expiry(expiry: date, as_of: date) -> int:
    return max((expiry - as_of).days, 0)


class _MultiLegStrategy(Strategy):
    """Base for strategies that manage multiple option legs."""

    def __init__(
        self,
        symbol:          str,
        initial_capital: float,
        iv:              float,
        lots:            int = 1,
        expiry_type:     str = "weekly",   # 'weekly' | 'monthly'
        slippage_pct:    float = 0.05,
    ):
        super().__init__(symbol, initial_capital)
        self.iv           = iv
        self.lots         = lots
        self.expiry_type  = expiry_type
        self.slippage_pct = slippage_pct
        self._legs: list[OptionLeg] = []
        self._entry_date: date | None = None

    def _apply_slippage(self, price: float, is_buy: bool) -> float:
        slip = price * self.slippage_pct / 100
        return price + slip if is_buy else price - slip

    def _close_all_legs(self, candle: Candle, expiry: date, reason: str) -> None:
        spot    = candle.close
        as_of   = candle.date
        chain   = OptionChain(self.symbol, spot, expiry, as_of, self.iv)
        total_pnl = 0.0

        for leg in self._legs:
            if leg.status == LegStatus.OPEN:
                if as_of >= expiry:
                    leg.expire(spot, as_of)
                else:
                    k = chain.get_strike(leg.strike)
                    price = (k.ce.price if leg.option_type == "CE" else k.pe.price) if k else 0.0
                    is_buy = leg.lots < 0   # closing a short = buy back
                    price  = self._apply_slippage(price, is_buy)
                    leg.close(price, as_of)
            total_pnl += leg.pnl

        trade = self._make_trade(
            symbol      = self.symbol,
            direction   = "LONG" if total_pnl >= 0 else "SHORT",
            entry_time  = candle.timestamp.replace(
                year=self._entry_date.year,
                month=self._entry_date.month,
                day=self._entry_date.day,
            ) if self._entry_date else candle.timestamp,
            exit_time   = candle.timestamp,
            entry_price = 1.0,   # placeholder — pnl is the real measure
            exit_price  = 1.0 + total_pnl,
            quantity    = self.lots,
            exit_reason = reason,
        )
        trade.pnl = round(total_pnl, 2)
        self.trades.append(trade)
        self.cash += total_pnl
        self._legs = []
        self._entry_date = None

    def on_done(self) -> None:
        pass   # positions already closed at expiry in on_bar


class IronCondor(_MultiLegStrategy):
    """
    Short Iron Condor: sell OTM CE + OTM PE, buy further OTM CE + PE.
    Profit if spot stays within the short strikes.
    Entered on the open of each expiry week (Monday morning).
    """

    def __init__(self, symbol, initial_capital, iv, lots=1,
                 wing_width: int = 2, expiry_type="weekly", slippage_pct=0.05):
        super().__init__(symbol, initial_capital, iv, lots, expiry_type, slippage_pct)
        self.wing_width = wing_width   # n strikes wide for the long wing

    def on_bar(self, candle: Candle, bar_index: int) -> None:
        spot   = candle.close
        as_of  = candle.date
        expiry = next_expiry(as_of, self.expiry_type)

        if not self._legs:
            # Only enter on Monday (weekday 0)
            if as_of.weekday() != 0:
                return
            chain = OptionChain(self.symbol, spot, expiry, as_of, self.iv)
            short_ce = chain.nth_otm("CE", 1)
            short_pe = chain.nth_otm("PE", 1)
            long_ce  = chain.nth_otm("CE", 1 + self.wing_width)
            long_pe  = chain.nth_otm("PE", 1 + self.wing_width)
            if not all([short_ce, short_pe, long_ce, long_pe]):
                return

            lot_size = chain.lot_size

            def make_leg(strike_obj, opt_type, lots, is_buy):
                price = strike_obj.ce.price if opt_type == "CE" else strike_obj.pe.price
                price = self._apply_slippage(price, is_buy)
                leg = OptionLeg(self.symbol, opt_type, strike_obj.strike,
                                expiry, lot_size, lots)
                leg.open(price, as_of)
                return leg

            self._legs = [
                make_leg(short_ce, "CE", -self.lots, False),
                make_leg(short_pe, "PE", -self.lots, False),
                make_leg(long_ce,  "CE",  self.lots, True),
                make_leg(long_pe,  "PE",  self.lots, True),
            ]
            self._entry_date = as_of
            return

        # Close at expiry
        if as_of >= expiry:
            self._close_all_legs(candle, expiry, "expiry")


class BullCallSpread(_MultiLegStrategy):
    """Buy ATM CE, sell OTM CE. Capped profit, capped loss."""

    def on_bar(self, candle: Candle, bar_index: int) -> None:
        spot   = candle.close
        as_of  = candle.date
        expiry = next_expiry(as_of, self.expiry_type)

        if not self._legs:
            if as_of.weekday() != 0:
                return
            chain   = OptionChain(self.symbol, spot, expiry, as_of, self.iv)
            atm_k   = chain.get_strike(chain.atm_strike())
            otm_ce  = chain.nth_otm("CE", 2)
            if not atm_k or not otm_ce:
                return

            lot_size = chain.lot_size
            buy_price  = self._apply_slippage(atm_k.ce.price, True)
            sell_price = self._apply_slippage(otm_ce.ce.price, False)

            self._legs = [
                OptionLeg(self.symbol, "CE", atm_k.strike, expiry, lot_size, self.lots),
                OptionLeg(self.symbol, "CE", otm_ce.strike, expiry, lot_size, -self.lots),
            ]
            self._legs[0].open(buy_price, as_of)
            self._legs[1].open(sell_price, as_of)
            self._entry_date = as_of
            return

        if as_of >= expiry:
            self._close_all_legs(candle, expiry, "expiry")


class BearPutSpread(_MultiLegStrategy):
    """Buy ATM PE, sell OTM PE. Profit when underlying falls."""

    def on_bar(self, candle: Candle, bar_index: int) -> None:
        spot   = candle.close
        as_of  = candle.date
        expiry = next_expiry(as_of, self.expiry_type)

        if not self._legs:
            if as_of.weekday() != 0:
                return
            chain  = OptionChain(self.symbol, spot, expiry, as_of, self.iv)
            atm_k  = chain.get_strike(chain.atm_strike())
            otm_pe = chain.nth_otm("PE", 2)
            if not atm_k or not otm_pe:
                return

            lot_size = chain.lot_size
            buy_price  = self._apply_slippage(atm_k.pe.price, True)
            sell_price = self._apply_slippage(otm_pe.pe.price, False)

            self._legs = [
                OptionLeg(self.symbol, "PE", atm_k.strike, expiry, lot_size, self.lots),
                OptionLeg(self.symbol, "PE", otm_pe.strike, expiry, lot_size, -self.lots),
            ]
            self._legs[0].open(buy_price, as_of)
            self._legs[1].open(sell_price, as_of)
            self._entry_date = as_of
            return

        if as_of >= expiry:
            self._close_all_legs(candle, expiry, "expiry")


class Strangle(_MultiLegStrategy):
    """Short Strangle: sell OTM CE + OTM PE. Max profit if spot stays still."""

    def on_bar(self, candle: Candle, bar_index: int) -> None:
        spot   = candle.close
        as_of  = candle.date
        expiry = next_expiry(as_of, self.expiry_type)

        if not self._legs:
            if as_of.weekday() != 0:
                return
            chain    = OptionChain(self.symbol, spot, expiry, as_of, self.iv)
            short_ce = chain.nth_otm("CE", 2)
            short_pe = chain.nth_otm("PE", 2)
            if not short_ce or not short_pe:
                return

            lot_size = chain.lot_size
            ce_price = self._apply_slippage(short_ce.ce.price, False)
            pe_price = self._apply_slippage(short_pe.pe.price, False)

            self._legs = [
                OptionLeg(self.symbol, "CE", short_ce.strike, expiry, lot_size, -self.lots),
                OptionLeg(self.symbol, "PE", short_pe.strike, expiry, lot_size, -self.lots),
            ]
            self._legs[0].open(ce_price, as_of)
            self._legs[1].open(pe_price, as_of)
            self._entry_date = as_of
            return

        if as_of >= expiry:
            self._close_all_legs(candle, expiry, "expiry")
