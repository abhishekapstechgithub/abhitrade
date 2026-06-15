'use client';
import { useState, useCallback } from 'react';
import { StrategyLeg, StrategyCategory } from '../types/strategy.types';
import { calcNetPremium, calcPayoff, calcMaxProfit, calcMaxLoss, calcBreakevens } from '../utils/strategy.utils';
import { strategyService } from '../services/strategy.service';

function newLeg(overrides?: Partial<StrategyLeg>): StrategyLeg {
  return {
    id:         crypto.randomUUID(),
    action:     'BUY',
    optionType: 'CE',
    strike:     0,
    expiry:     '',
    lots:       1,
    premium:    0,
    ...overrides,
  };
}

export function useStrategyBuilder(symbol = 'NIFTY') {
  const [name, setName]         = useState('');
  const [category, setCategory] = useState<StrategyCategory>('neutral');
  const [legs, setLegs]         = useState<StrategyLeg[]>([newLeg()]);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const addLeg = useCallback(() => setLegs(prev => [...prev, newLeg()]), []);

  const removeLeg = useCallback((id: string) =>
    setLegs(prev => prev.filter(l => l.id !== id)), []);

  const updateLeg = useCallback((id: string, patch: Partial<StrategyLeg>) =>
    setLegs(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l)), []);

  const reset = useCallback(() => {
    setName(''); setCategory('neutral'); setLegs([newLeg()]); setError(null);
  }, []);

  // Derived analytics — spot range ±20% of ATM strike (or 0 if not set)
  const atm    = legs[0]?.strike || 20000;
  const range: [number, number] = [atm * 0.8, atm * 1.2];
  const points = calcPayoff(legs, range);
  const analytics = {
    netPremium:   calcNetPremium(legs),
    maxProfit:    calcMaxProfit(points),
    maxLoss:      calcMaxLoss(points),
    breakevenLow: calcBreakevens(points)[0],
    breakevenHigh:calcBreakevens(points)[1],
    payoffPoints: points,
  };

  const save = useCallback(async () => {
    if (!name.trim()) { setError('Strategy name is required'); return; }
    if (legs.some(l => !l.strike || !l.expiry)) { setError('Fill all leg fields'); return; }
    setSaving(true);
    setError(null);
    try {
      await strategyService.create({
        name: name.trim(), symbol, exchange: 'NSE', category, status: 'saved',
        legs, ...analytics,
      });
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [name, symbol, category, legs, analytics, reset]);

  return { name, setName, category, setCategory, legs, addLeg, removeLeg, updateLeg, analytics, saving, error, save, reset };
}
