'use client';
import { create } from 'zustand';

export interface ChartTarget {
  symbol:   string;
  exchange: string;
  token:    string;
  name?:    string;
}

interface ChartStore {
  isOpen:     boolean;
  target:     ChartTarget | null;
  openChart:  (t: ChartTarget) => void;
  closeChart: () => void;
}

export const useChartStore = create<ChartStore>(set => ({
  isOpen:     false,
  target:     null,
  openChart:  (target) => set({ isOpen: true, target }),
  closeChart: ()       => set({ isOpen: false }),
}));
