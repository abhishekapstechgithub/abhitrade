// Central barrel for all models

// ─── Market Breadth ───────────────────────────────────────────────────────────
class MarketBreadthData {
  final int advances;
  final int declines;
  final double? pcr;
  final double? vix;
  final double? vixChange;
  final double? fiiCash;
  final double? diiCash;
  final double? maxPain;

  const MarketBreadthData({
    this.advances = 0,
    this.declines = 0,
    this.pcr,
    this.vix,
    this.vixChange,
    this.fiiCash,
    this.diiCash,
    this.maxPain,
  });

  factory MarketBreadthData.fromJson(Map<String, dynamic> j) => MarketBreadthData(
    advances:  _i(j['advances']  ?? j['advance']  ?? j['advancingStocks']  ?? 0),
    declines:  _i(j['declines']  ?? j['decline']  ?? j['decliningStocks']  ?? 0),
    pcr:       _d(j['pcr']       ?? j['put_call_ratio'] ?? j['putCallRatio']),
    vix:       _d(j['vix']       ?? j['india_vix'] ?? j['indiaVix']),
    vixChange: _d(j['vix_change'] ?? j['vixChange'] ?? j['vix_pct']),
    fiiCash:   _d(j['fii_cash']  ?? j['fiiCash']  ?? j['fii']),
    diiCash:   _d(j['dii_cash']  ?? j['diiCash']  ?? j['dii']),
    maxPain:   _d(j['max_pain']  ?? j['maxPain']  ?? j['max_pain_strike']),
  );

  MarketBreadthData copyWith({double? vix, double? vixChange}) => MarketBreadthData(
    advances:  advances,
    declines:  declines,
    pcr:       pcr,
    vix:       vix ?? this.vix,
    vixChange: vixChange ?? this.vixChange,
    fiiCash:   fiiCash,
    diiCash:   diiCash,
    maxPain:   maxPain,
  );

  static double? _d(dynamic v) =>
      v == null ? null : (v is num ? v.toDouble() : double.tryParse(v.toString()));
  static int _i(dynamic v) =>
      v == null ? 0 : (v is int ? v : int.tryParse(v.toString()) ?? 0);
}

// ─── User ─────────────────────────────────────────────────────────────────────
class AppUser {
  final String id;
  final String email;
  final String name;

  const AppUser({required this.id, required this.email, required this.name});

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
    id: j['id']?.toString() ?? '',
    email: j['email'] ?? '',
    name: j['name'] ?? 'Trader',
  );

  Map<String, dynamic> toJson() => {'id': id, 'email': email, 'name': name};

  String get initials {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return name.isNotEmpty ? name[0].toUpperCase() : 'T';
  }
}

// ─── Market ───────────────────────────────────────────────────────────────────
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

  factory IndexPrice.fromJson(String symbol, Map<String, dynamic> j) => IndexPrice(
    symbol: symbol,
    ltp: (j['ltp'] ?? j['close'] ?? 0).toDouble(),
    change: (j['change'] ?? j['net_change'] ?? 0).toDouble(),
    changePct: (j['changePct'] ?? j['changePercent'] ?? j['percent_change'] ?? 0).toDouble(),
  );

  bool get isPositive => changePct >= 0;
}

class GainerLoser {
  final String symbol;
  final String tradingSymbol;
  final String exchange;
  final double ltp;
  final double netChange;
  final double percentChange;
  final int volume;

  const GainerLoser({
    required this.symbol,
    required this.tradingSymbol,
    required this.exchange,
    required this.ltp,
    required this.netChange,
    required this.percentChange,
    required this.volume,
  });

  factory GainerLoser.fromJson(Map<String, dynamic> j) => GainerLoser(
    // market-movers uses nse_code; quote/search uses symbol
    symbol: j['symbol']?.toString() ?? j['nse_code']?.toString() ?? j['bse_code']?.toString() ?? '',
    tradingSymbol: j['tradingSymbol']?.toString() ?? j['trading_symbol']?.toString()
        ?? j['company_short']?.toString() ?? j['company_name']?.toString()
        ?? j['nse_code']?.toString() ?? j['symbol']?.toString() ?? '',
    exchange: j['exchange']?.toString() ?? (j['nse_code'] != null ? 'NSE' : 'BSE'),
    ltp: (j['ltp'] ?? 0).toDouble(),
    netChange: (j['netChange'] ?? j['change'] ?? 0).toDouble(),
    // market-movers uses change_pct; others use changePct / percentChange
    percentChange: (j['percentChange'] ?? j['changePct'] ?? j['change_pct'] ?? 0).toDouble(),
    volume: (j['volume'] ?? 0).toInt(),
  );

  bool get isPositive => percentChange >= 0;
}

// ─── Watchlist ────────────────────────────────────────────────────────────────
class WatchlistItem {
  final String id;
  final String symbol;
  final String company;
  final String exchange;
  final String token;
  final String instrumentType;
  final double ltp;
  final double change;
  final double changePct;
  final double high;
  final double low;
  final double open;
  final double prevClose;
  final int volume;
  final List<double> sparkline;

  const WatchlistItem({
    required this.id,
    required this.symbol,
    required this.company,
    required this.exchange,
    this.token = '',
    this.instrumentType = 'EQ',
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
    id: j['id']?.toString() ?? j['symbol'] ?? '',
    symbol: j['symbol'] ?? '',
    company: j['company'] ?? j['name'] ?? j['trading_symbol'] ?? j['symbol'] ?? '',
    exchange: j['exchange'] ?? 'NSE',
    token: j['token']?.toString() ?? '',
    instrumentType: j['instrument_type']?.toString() ?? j['instrumentType']?.toString() ?? 'EQ',
    ltp: (j['ltp'] ?? 0).toDouble(),
    change: (j['change'] ?? 0).toDouble(),
    changePct: (j['changePct'] ?? j['change_pct'] ?? 0).toDouble(),
    high: (j['high'] ?? 0).toDouble(),
    low: (j['low'] ?? 0).toDouble(),
    open: (j['open'] ?? 0).toDouble(),
    prevClose: (j['prevClose'] ?? j['prev_close'] ?? 0).toDouble(),
    volume: (j['volume'] ?? 0).toInt(),
  );

  const WatchlistItem.empty()
      : id = '', symbol = '', company = '', exchange = 'NSE', token = '',
        instrumentType = 'EQ', ltp = 0, change = 0, changePct = 0,
        high = 0, low = 0, open = 0, prevClose = 0, volume = 0,
        sparkline = const [];

  WatchlistItem copyWith({
    String? id, String? symbol, String? company, String? exchange,
    String? token, String? instrumentType,
    double? ltp, double? change, double? changePct,
    double? high, double? low, double? open, double? prevClose,
    int? volume, List<double>? sparkline,
  }) => WatchlistItem(
    id: id ?? this.id, symbol: symbol ?? this.symbol,
    company: company ?? this.company, exchange: exchange ?? this.exchange,
    token: token ?? this.token, instrumentType: instrumentType ?? this.instrumentType,
    ltp: ltp ?? this.ltp, change: change ?? this.change,
    changePct: changePct ?? this.changePct, high: high ?? this.high,
    low: low ?? this.low, open: open ?? this.open,
    prevClose: prevClose ?? this.prevClose, volume: volume ?? this.volume,
    sparkline: sparkline ?? this.sparkline,
  );

  bool get isPositive => changePct >= 0;
}

class Watchlist {
  final String id;
  final String name;
  final List<WatchlistItem> items;

  const Watchlist({required this.id, required this.name, required this.items});

  factory Watchlist.fromJson(Map<String, dynamic> j) => Watchlist(
    id: j['id']?.toString() ?? '',
    name: j['name'] ?? 'Watchlist',
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
  final int quantity;
  final double avgPrice;
  final double ltp;
  final double currentValue;
  final double investedValue;
  final double pnl;
  final double pnlPct;
  final String sector;
  final double dayChange;
  final double dayChangePct;

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
    this.dayChange = 0,
    this.dayChangePct = 0,
  });

  factory Holding.fromJson(Map<String, dynamic> j) {
    final qty = (j['quantity'] ?? 0).toInt();
    final avg = (j['average_price'] ?? j['avg_price'] ?? j['avgPrice'] ?? 0).toDouble();
    final ltp = (j['ltp'] ?? 0).toDouble();
    final inv = avg * qty;
    final cur = ltp * qty;
    final dayChange = (j['day_change'] ?? j['dayChange'] ?? j['net_change'] ?? 0).toDouble();
    final dayChangePct = (j['day_change_pct'] ?? j['dayChangePct'] ?? j['percent_change'] ?? 0).toDouble();
    return Holding(
      symbol: j['symbol'] ?? '',
      company: j['company'] ?? j['symbol'] ?? '',
      exchange: j['exchange'] ?? 'NSE',
      quantity: qty,
      avgPrice: avg,
      ltp: ltp,
      currentValue: cur,
      investedValue: inv,
      pnl: cur - inv,
      pnlPct: inv > 0 ? ((cur - inv) / inv) * 100 : 0,
      sector: j['sector'] ?? 'Others',
      dayChange: dayChange,
      dayChangePct: dayChangePct,
    );
  }

  bool get isProfit => pnl >= 0;
}

// ─── Orders ───────────────────────────────────────────────────────────────────
enum OrderSide { buy, sell }
enum OrderStatus { open, pending, complete, cancelled, rejected }
enum OrderType { market, limit, sl, slm }
enum ProductType { cnc, mis, nrml }

class Order {
  final String id;
  final String symbol;
  final String exchange;
  final OrderSide side;
  final OrderStatus status;
  final OrderType orderType;
  final ProductType productType;
  final int quantity;
  final int filledQty;
  final double price;
  final double avgPrice;
  final DateTime placedAt;
  final bool isPaper;

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
  });

  factory Order.fromJson(Map<String, dynamic> j) => Order(
    id: j['id']?.toString() ?? '',
    symbol: j['symbol'] ?? '',
    exchange: j['exchange'] ?? 'NSE',
    side: j['transaction_type'] == 'SELL' || j['side'] == 'SELL'
        ? OrderSide.sell
        : OrderSide.buy,
    status: _parseStatus(j['status']),
    orderType: _parseOrderType(j['order_type']),
    productType: _parseProductType(j['product_type']),
    quantity: (j['quantity'] ?? 0).toInt(),
    filledQty: (j['filled_quantity'] ?? j['filledQty'] ?? 0).toInt(),
    price: (j['price'] ?? 0).toDouble(),
    avgPrice: (j['average_price'] ?? j['avg_price'] ?? j['avgPrice'] ?? 0).toDouble(),
    placedAt: j['placed_at'] != null
        ? DateTime.tryParse(j['placed_at']) ?? DateTime.now()
        : j['created_at'] != null
            ? DateTime.tryParse(j['created_at']) ?? DateTime.now()
            : DateTime.now(),
    isPaper: j['is_paper'] == true || j['mode'] == 'paper',
  );

  static OrderStatus _parseStatus(dynamic s) {
    switch (s?.toString().toUpperCase()) {
      case 'COMPLETE': return OrderStatus.complete;
      case 'CANCELLED': return OrderStatus.cancelled;
      case 'REJECTED': return OrderStatus.rejected;
      case 'PENDING': return OrderStatus.pending;
      default: return OrderStatus.open;
    }
  }

  static OrderType _parseOrderType(dynamic t) {
    switch (t?.toString().toUpperCase()) {
      case 'LIMIT': return OrderType.limit;
      case 'SL': return OrderType.sl;
      case 'SL-M': return OrderType.slm;
      default: return OrderType.market;
    }
  }

  static ProductType _parseProductType(dynamic p) {
    switch (p?.toString().toUpperCase()) {
      case 'MIS':
      case 'INTRADAY':    return ProductType.mis;
      case 'NRML':
      case 'CARRYFORWARD': return ProductType.nrml;
      case 'CNC':
      case 'DELIVERY':    return ProductType.cnc;
      default:            return ProductType.cnc;
    }
  }

  bool get isActive => status == OrderStatus.open || status == OrderStatus.pending;
  bool get isBuy    => side == OrderSide.buy;
}

// ─── Paper Trade ──────────────────────────────────────────────────────────────
class PaperOrder {
  final String id;
  final String symbol;
  final OrderSide side;
  final int quantity;
  final double price;
  final DateTime placedAt;

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
