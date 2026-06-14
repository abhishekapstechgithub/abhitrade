// Central barrel for all domain models

// ─── User ─────────────────────────────────────────────────────────────────────
class AppUser {
  final String id;
  final String email;
  final String name;
  final String? phone;
  final String? avatarUrl;

  const AppUser({
    required this.id,
    required this.email,
    required this.name,
    this.phone,
    this.avatarUrl,
  });

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id:        j['id']?.toString() ?? '',
        email:     j['email']     ?? '',
        name:      j['name']      ?? 'Trader',
        phone:     j['phone']     as String?,
        avatarUrl: j['avatar_url'] as String?,
      );

  Map<String, dynamic> toJson() =>
      {'id': id, 'email': email, 'name': name};

  String get initials {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return name.isNotEmpty ? name[0].toUpperCase() : 'T';
  }
}

// ─── Market — Index Price ─────────────────────────────────────────────────────
class IndexPrice {
  final String symbol;
  final double ltp;
  final double change;
  final double changePct;

  const IndexPrice({
    required this.symbol,
    required this.ltp,
    required this.change,
    required this.changePct,
  });

  factory IndexPrice.fromJson(String symbol, Map<String, dynamic> j) =>
      IndexPrice(
        symbol:    symbol,
        ltp:       _d(j['ltp']          ?? j['close']           ?? 0),
        change:    _d(j['change']        ?? j['net_change']      ?? 0),
        changePct: _d(j['changePct']     ?? j['percent_change']  ?? 0),
      );

  bool get isPositive => changePct >= 0;
}

// ─── Market — Gainer / Loser / Market Mover ──────────────────────────────────
// Maps to the web /api/market-movers response shape.
class GainerLoser {
  final String symbol;          // nse_code or bse_code
  final String tradingSymbol;   // same as symbol (for chart compat)
  final String companyName;
  final String companyShort;
  final String exchange;
  final double ltp;
  final double netChange;       // absolute change
  final double percentChange;   // change_pct
  final int    volume;
  final double? yearHigh;
  final double? yearLow;
  final double? marketCap;
  final String  moverType;      // 'gainers' | 'losers' | etc.

  const GainerLoser({
    required this.symbol,
    required this.tradingSymbol,
    required this.companyName,
    required this.companyShort,
    required this.exchange,
    required this.ltp,
    required this.netChange,
    required this.percentChange,
    required this.volume,
    this.yearHigh,
    this.yearLow,
    this.marketCap,
    this.moverType = 'gainers',
  });

  /// Parses the web /api/market-movers item shape.
  factory GainerLoser.fromJson(Map<String, dynamic> j) {
    final sym = (j['nse_code'] ?? j['bse_code'] ?? j['symbol'] ?? '').toString();
    return GainerLoser(
      symbol:        sym,
      tradingSymbol: sym,
      companyName:   (j['company_name']  ?? j['companyName']  ?? sym).toString(),
      companyShort:  (j['company_short'] ?? j['companyShort'] ?? sym).toString(),
      exchange:      (j['exchange']      ?? 'NSE').toString(),
      ltp:           _d(j['ltp']         ?? 0),
      netChange:     _d(j['change']      ?? j['netChange']    ?? 0),
      percentChange: _d(j['change_pct']  ?? j['percentChange'] ?? 0),
      volume:        _i(j['volume']      ?? 0),
      yearHigh:      j['year_high']  != null ? _d(j['year_high'])  : null,
      yearLow:       j['year_low']   != null ? _d(j['year_low'])   : null,
      marketCap:     j['market_cap'] != null ? _d(j['market_cap']) : null,
      moverType:     (j['mover_type'] ?? 'gainers').toString(),
    );
  }

  bool get isPositive => percentChange >= 0;
}

// ─── Search Result ────────────────────────────────────────────────────────────
class SearchResult {
  final String token;
  final String symbol;
  final String tradingSymbol;
  final String exchange;
  final String instrumentType;
  final String? expiry;
  final double? strike;
  final String? optionType;
  final int?    lotSize;
  final String? underlying;
  final String? isin;

  const SearchResult({
    required this.token,
    required this.symbol,
    required this.tradingSymbol,
    required this.exchange,
    required this.instrumentType,
    this.expiry,
    this.strike,
    this.optionType,
    this.lotSize,
    this.underlying,
    this.isin,
  });

  factory SearchResult.fromJson(Map<String, dynamic> j) => SearchResult(
        token:          (j['token']           ?? j['instrumenttoken'] ?? '').toString(),
        symbol:         (j['symbol']          ?? '').toString(),
        tradingSymbol:  (j['trading_symbol']  ?? j['tradingSymbol'] ?? j['symbol'] ?? '').toString(),
        exchange:       (j['exchange']        ?? 'NSE').toString(),
        instrumentType: (j['instrument_type'] ?? j['instrumentType'] ?? 'EQ').toString(),
        expiry:         j['expiry']      as String?,
        strike:         j['strike']      != null ? _d(j['strike'])   : null,
        optionType:     j['option_type'] as String?,
        lotSize:        j['lot_size']    != null ? _i(j['lot_size']) : null,
        underlying:     j['underlying']  as String?,
        isin:           j['isin']        as String?,
      );

  bool get isOption => instrumentType == 'OPTIDX' || instrumentType == 'OPTSTK';
  bool get isFuture => instrumentType == 'FUTIDX' || instrumentType == 'FUTSTK';
}

// ─── Option Chain ─────────────────────────────────────────────────────────────
class OptionExpiry {
  final String date;     // YYYY-MM-DD
  final String label;    // human-readable: "26 Jun 25"
  final bool   isWeekly;

  const OptionExpiry({
    required this.date,
    required this.label,
    required this.isWeekly,
  });

  factory OptionExpiry.fromJson(Map<String, dynamic> j) => OptionExpiry(
        date:     (j['date']  ?? '').toString(),
        label:    (j['label'] ?? j['date'] ?? '').toString(),
        isWeekly: j['isWeekly'] == true || j['is_weekly'] == true,
      );
}

class OptionQuote {
  final double ltp;
  final double bid;
  final double ask;
  final double iv;
  final int    oi;
  final int    oiChange;
  final int    volume;
  final double delta;
  final double gamma;
  final double theta;
  final double vega;

  const OptionQuote({
    required this.ltp,
    required this.bid,
    required this.ask,
    required this.iv,
    required this.oi,
    required this.oiChange,
    required this.volume,
    required this.delta,
    required this.gamma,
    required this.theta,
    required this.vega,
  });

  factory OptionQuote.fromJson(Map<String, dynamic> j) => OptionQuote(
        ltp:      _d(j['ltp']      ?? 0),
        bid:      _d(j['bid']      ?? 0),
        ask:      _d(j['ask']      ?? 0),
        iv:       _d(j['iv']       ?? 0),
        oi:       _i(j['oi']       ?? 0),
        oiChange: _i(j['oiChange'] ?? j['oi_change'] ?? 0),
        volume:   _i(j['volume']   ?? 0),
        delta:    _d(j['delta']    ?? 0),
        gamma:    _d(j['gamma']    ?? 0),
        theta:    _d(j['theta']    ?? 0),
        vega:     _d(j['vega']     ?? 0),
      );
}

class OptionChainRow {
  final double strike;
  final bool   isAtm;
  final bool   isItm;
  final OptionQuote? ce;
  final OptionQuote? pe;

  const OptionChainRow({
    required this.strike,
    required this.isAtm,
    required this.isItm,
    this.ce,
    this.pe,
  });

  factory OptionChainRow.fromJson(Map<String, dynamic> j) => OptionChainRow(
        strike: _d(j['strike'] ?? 0),
        isAtm:  j['isATM'] == true || j['is_atm'] == true,
        isItm:  j['isITM'] == true || j['is_itm'] == true,
        ce:     j['ce'] != null
            ? OptionQuote.fromJson(j['ce'] as Map<String, dynamic>)
            : null,
        pe:     j['pe'] != null
            ? OptionQuote.fromJson(j['pe'] as Map<String, dynamic>)
            : null,
      );
}

class OptionChainData {
  final String symbol;
  final String expiry;
  final double spotPrice;
  final double atm;
  final double pcr;
  final double? maxPain;
  final List<OptionChainRow> rows;

  const OptionChainData({
    required this.symbol,
    required this.expiry,
    required this.spotPrice,
    required this.atm,
    required this.pcr,
    this.maxPain,
    required this.rows,
  });

  factory OptionChainData.fromJson(Map<String, dynamic> j) {
    final analytics = j['analytics'] as Map<String, dynamic>? ?? {};
    return OptionChainData(
      symbol:    (j['symbol']   ?? '').toString(),
      expiry:    (j['expiry']   ?? '').toString(),
      spotPrice: _d(j['spotPrice'] ?? j['spot_price'] ?? 0),
      atm:       _d(analytics['atm'] ?? j['atm'] ?? 0),
      pcr:       _d(analytics['pcr'] ?? j['pcr'] ?? 0),
      maxPain:   analytics['maxPain'] != null
          ? _d(analytics['maxPain'])
          : null,
      rows: (j['rows'] as List<dynamic>? ?? [])
          .map((e) => OptionChainRow.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

// ─── Watchlist ────────────────────────────────────────────────────────────────
class WatchlistItem {
  final String id;
  final String symbol;
  final String company;
  final String exchange;
  final double ltp;
  final double change;
  final double changePct;
  final double high;
  final double low;
  final double open;
  final double prevClose;
  final int    volume;
  final List<double> sparkline;

  const WatchlistItem({
    required this.id,
    required this.symbol,
    required this.company,
    required this.exchange,
    required this.ltp,
    required this.change,
    required this.changePct,
    required this.high,
    required this.low,
    required this.open,
    required this.prevClose,
    required this.volume,
    this.sparkline = const [],
  });

  factory WatchlistItem.fromJson(Map<String, dynamic> j) => WatchlistItem(
        id:        (j['id']       ?? j['symbol'] ?? '').toString(),
        symbol:    (j['symbol']   ?? '').toString(),
        company:   (j['company']  ?? j['name'] ?? j['symbol'] ?? '').toString(),
        exchange:  (j['exchange'] ?? 'NSE').toString(),
        ltp:       _d(j['ltp']      ?? 0),
        change:    _d(j['change']   ?? 0),
        changePct: _d(j['changePct']  ?? j['change_pct'] ?? 0),
        high:      _d(j['high']     ?? 0),
        low:       _d(j['low']      ?? 0),
        open:      _d(j['open']     ?? 0),
        prevClose: _d(j['prevClose'] ?? j['prev_close'] ?? 0),
        volume:    _i(j['volume']   ?? 0),
      );

  bool get isPositive => changePct >= 0;
}

class Watchlist {
  final String id;
  final String name;
  final List<WatchlistItem> items;

  const Watchlist({required this.id, required this.name, required this.items});

  factory Watchlist.fromJson(Map<String, dynamic> j) => Watchlist(
        id:    (j['id']   ?? '').toString(),
        name:  (j['name'] ?? 'Watchlist').toString(),
        items: (j['items'] as List<dynamic>? ?? [])
            .map((e) => WatchlistItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

// ─── Portfolio / Holdings ─────────────────────────────────────────────────────
class Holding {
  final String symbol;
  final String company;
  final String exchange;
  final int    quantity;
  final double avgPrice;
  final double ltp;
  final double currentValue;
  final double investedValue;
  final double pnl;
  final double pnlPct;
  final String sector;

  const Holding({
    required this.symbol,
    required this.company,
    required this.exchange,
    required this.quantity,
    required this.avgPrice,
    required this.ltp,
    required this.currentValue,
    required this.investedValue,
    required this.pnl,
    required this.pnlPct,
    required this.sector,
  });

  factory Holding.fromJson(Map<String, dynamic> j) {
    final qty = _i(j['quantity']  ?? 0);
    final avg = _d(j['avg_price'] ?? j['avgPrice'] ?? 0);
    final ltp = _d(j['ltp']       ?? 0);
    final inv = avg * qty;
    final cur = ltp * qty;
    return Holding(
      symbol:       (j['symbol']  ?? '').toString(),
      company:      (j['company'] ?? j['symbol'] ?? '').toString(),
      exchange:     (j['exchange'] ?? 'NSE').toString(),
      quantity:     qty,
      avgPrice:     avg,
      ltp:          ltp,
      currentValue: cur,
      investedValue: inv,
      pnl:          cur - inv,
      pnlPct:       inv > 0 ? ((cur - inv) / inv) * 100 : 0,
      sector:       (j['sector'] ?? 'Others').toString(),
    );
  }

  bool get isProfit => pnl >= 0;
}

// ─── Position ─────────────────────────────────────────────────────────────────
class Position {
  final String symbol;
  final String exchange;
  final String productType;  // MIS | CNC | NRML
  final int    buyQty;
  final int    sellQty;
  final int    netQty;
  final double avgBuyPrice;
  final double avgSellPrice;
  final double ltp;
  final double unrealisedPnl;
  final double realisedPnl;
  final double pnl;

  const Position({
    required this.symbol,
    required this.exchange,
    required this.productType,
    required this.buyQty,
    required this.sellQty,
    required this.netQty,
    required this.avgBuyPrice,
    required this.avgSellPrice,
    required this.ltp,
    required this.unrealisedPnl,
    required this.realisedPnl,
    required this.pnl,
  });

  factory Position.fromJson(Map<String, dynamic> j) {
    final netQty       = _i(j['net_quantity']    ?? j['netQty']       ?? 0);
    final avgBuy       = _d(j['avg_buy_price']   ?? j['avgBuyPrice']  ?? 0);
    final ltp          = _d(j['ltp']             ?? 0);
    final unrealised   = netQty * (ltp - avgBuy);
    final realised     = _d(j['realised_pnl']    ?? j['realisedPnl']  ?? 0);
    return Position(
      symbol:         (j['symbol']       ?? '').toString(),
      exchange:       (j['exchange']     ?? 'NSE').toString(),
      productType:    (j['product_type'] ?? j['productType'] ?? 'MIS').toString(),
      buyQty:         _i(j['buy_quantity']  ?? j['buyQty']  ?? 0),
      sellQty:        _i(j['sell_quantity'] ?? j['sellQty'] ?? 0),
      netQty:         netQty,
      avgBuyPrice:    avgBuy,
      avgSellPrice:   _d(j['avg_sell_price'] ?? j['avgSellPrice'] ?? 0),
      ltp:            ltp,
      unrealisedPnl:  unrealised,
      realisedPnl:    realised,
      pnl:            unrealised + realised,
    );
  }

  bool get isLong  => netQty > 0;
  bool get isProfit => pnl >= 0;
}

// ─── Orders ───────────────────────────────────────────────────────────────────
enum OrderSide { buy, sell }
enum OrderStatus { open, pending, complete, cancelled, rejected }
enum OrderType { market, limit, sl, slm }
enum ProductType { cnc, mis, nrml }

class Order {
  final String      id;
  final String      symbol;
  final String      exchange;
  final OrderSide   side;
  final OrderStatus status;
  final OrderType   orderType;
  final ProductType productType;
  final int         quantity;
  final int         filledQty;
  final double      price;
  final double      avgPrice;
  final DateTime    placedAt;
  final bool        isPaper;
  final String?     rejectionReason;

  const Order({
    required this.id,
    required this.symbol,
    required this.exchange,
    required this.side,
    required this.status,
    required this.orderType,
    required this.productType,
    required this.quantity,
    required this.filledQty,
    required this.price,
    required this.avgPrice,
    required this.placedAt,
    this.isPaper = false,
    this.rejectionReason,
  });

  factory Order.fromJson(Map<String, dynamic> j) => Order(
        id:       (j['id'] ?? '').toString(),
        symbol:   (j['symbol']   ?? '').toString(),
        exchange: (j['exchange'] ?? 'NSE').toString(),
        side:     (j['transaction_type'] ?? j['side'] ?? '').toString().toUpperCase() == 'SELL'
            ? OrderSide.sell
            : OrderSide.buy,
        status:      _parseStatus(j['status']),
        orderType:   _parseOrderType(j['order_type']),
        productType: _parseProductType(j['product_type']),
        quantity:  _i(j['quantity']                              ?? 0),
        filledQty: _i(j['filled_quantity'] ?? j['filledQty']    ?? 0),
        price:     _d(j['price']                                 ?? 0),
        avgPrice:  _d(j['avg_price']       ?? j['avgPrice']      ?? 0),
        placedAt:  j['created_at'] != null
            ? DateTime.tryParse(j['created_at'].toString()) ?? DateTime.now()
            : DateTime.now(),
        isPaper:          j['is_paper'] == true || j['mode'] == 'paper',
        rejectionReason:  j['rejection_reason'] as String?,
      );

  static OrderStatus _parseStatus(dynamic s) {
    switch (s?.toString().toUpperCase()) {
      case 'COMPLETE':  return OrderStatus.complete;
      case 'CANCELLED': return OrderStatus.cancelled;
      case 'REJECTED':  return OrderStatus.rejected;
      case 'PENDING':   return OrderStatus.pending;
      default:          return OrderStatus.open;
    }
  }

  static OrderType _parseOrderType(dynamic t) {
    switch (t?.toString().toUpperCase()) {
      case 'LIMIT': return OrderType.limit;
      case 'SL':    return OrderType.sl;
      case 'SL-M':  return OrderType.slm;
      default:      return OrderType.market;
    }
  }

  static ProductType _parseProductType(dynamic p) {
    switch (p?.toString().toUpperCase()) {
      case 'MIS':  return ProductType.mis;
      case 'NRML': return ProductType.nrml;
      default:     return ProductType.cnc;
    }
  }

  bool get isActive => status == OrderStatus.open || status == OrderStatus.pending;
  bool get isBuy    => side == OrderSide.buy;
}

// ─── Paper Trade ──────────────────────────────────────────────────────────────
class PaperOrder {
  final String    id;
  final String    symbol;
  final OrderSide side;
  final int       quantity;
  final double    price;
  final DateTime  placedAt;

  const PaperOrder({
    required this.id,
    required this.symbol,
    required this.side,
    required this.quantity,
    required this.price,
    required this.placedAt,
  });

  double get total => price * quantity;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
double _d(dynamic v) => (v is num) ? v.toDouble() : double.tryParse(v.toString()) ?? 0.0;
int    _i(dynamic v) => (v is int) ? v : int.tryParse(v.toString()) ?? 0;
