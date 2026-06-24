export type StrategyCategory = 'bullish' | 'bearish' | 'neutral' | 'hedged' | 'income';
export type StrategyStatus   = 'saved' | 'deployed' | 'simulating' | 'expired';
export type OptionType       = 'CE' | 'PE';
export type LegAction        = 'BUY' | 'SELL';

export interface StrategyLeg {
  id:           string;
  action:       LegAction;
  optionType:   OptionType;
  strike:       number;
  expiry:       string;       // YYYY-MM-DD
  lots:         number;
  premium:      number;
  iv?:          number;
  delta?:       number;
  theta?:       number;
}

export interface Strategy {
  id:           string;
  name:         string;
  symbol:       string;
  exchange:     'NSE' | 'BSE';
  category:     StrategyCategory;
  status:       StrategyStatus;
  legs:         StrategyLeg[];
  maxProfit:    number | null;   // null = unlimited
  maxLoss:      number | null;   // null = unlimited
  breakevenLow: number | null;
  breakevenHigh:number | null;
  netPremium:   number;          // positive = credit received
  createdAt:    string;
  updatedAt:    string;
  tags?:        string[];
  notes?:       string;
}

export interface StrategyFilters {
  category: StrategyCategory | 'all';
  status:   StrategyStatus   | 'all';
  symbol:   string;
}

export interface PayoffPoint {
  price:  number;
  pnl:    number;
}
