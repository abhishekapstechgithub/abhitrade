'use client';
import { create } from 'zustand';

type FontSize = 'small' | 'normal' | 'large';

interface UIStore {
  searchOpen: boolean;
  orderPanelOpen: boolean;
  orderSide: 'BUY' | 'SELL';
  orderSymbol: string;
  orderToken: string;
  notificationsOpen: boolean;
  activeNav: string;
  fontSize: FontSize;
  pinnedIndices: string[];
  setSearchOpen: (open: boolean) => void;
  openOrderPanel: (symbol: string, side: 'BUY' | 'SELL', token?: string) => void;
  closeOrderPanel: () => void;
  setNotificationsOpen: (open: boolean) => void;
  setActiveNav: (nav: string) => void;
  setFontSize: (size: FontSize) => void;
  togglePinnedIndex: (symbol: string) => void;
}

function storedFontSize(): FontSize {
  if (typeof window === 'undefined') return 'normal';
  return (localStorage.getItem('at-fontsize') as FontSize) || 'normal';
}

export const useUIStore = create<UIStore>((set, get) => ({
  searchOpen: false,
  orderPanelOpen: false,
  orderSide: 'BUY',
  orderSymbol: '',
  orderToken: '',
  notificationsOpen: false,
  activeNav: 'dashboard',
  fontSize: storedFontSize(),
  pinnedIndices: ['NIFTY 50', 'SENSEX'],
  setSearchOpen: (open) => set({ searchOpen: open }),
  openOrderPanel: (symbol, side, token = '') => set({ orderPanelOpen: true, orderSymbol: symbol, orderSide: side, orderToken: token }),
  closeOrderPanel: () => set({ orderPanelOpen: false }),
  setNotificationsOpen: (open) => set({ notificationsOpen: open }),
  setActiveNav: (nav) => set({ activeNav: nav }),
  setFontSize: (size) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('at-fontsize', size);
      document.documentElement.setAttribute('data-font-size', size);
    }
    set({ fontSize: size });
  },
  togglePinnedIndex: (symbol) => {
    const { pinnedIndices } = get();
    if (pinnedIndices.includes(symbol)) {
      set({ pinnedIndices: pinnedIndices.filter(s => s !== symbol) });
    } else if (pinnedIndices.length < 2) {
      set({ pinnedIndices: [...pinnedIndices, symbol] });
    }
  },
}));
