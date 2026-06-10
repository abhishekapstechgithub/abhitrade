'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AngelOneCredentials {
  apiKey: string;
  clientId: string;
  clientPassword: string;
  totpSecret: string;
}

interface AngelOneStore {
  credentials: AngelOneCredentials;
  accessToken: string;
  feedToken: string;
  isConnected: boolean;
  mode: 'paper' | 'live';
  lastConnected: string | null;
  connecting: boolean;
  connectError: string | null;
  setCredentials: (creds: Partial<AngelOneCredentials>) => void;
  setMode: (mode: 'paper' | 'live') => void;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const useAngelOneStore = create<AngelOneStore>()(
  persist(
    (set, get) => ({
      credentials: { apiKey: '', clientId: '', clientPassword: '', totpSecret: '' },
      accessToken: '',
      feedToken: '',
      isConnected: false,
      mode: 'paper',
      lastConnected: null,
      connecting: false,
      connectError: null,

      setCredentials: (creds) => set(s => ({ credentials: { ...s.credentials, ...creds }, connectError: null })),

      setMode: (mode) => set({ mode }),

      connect: async () => {
        const { credentials } = get();
        if (!credentials.apiKey || !credentials.clientId) {
          set({ connectError: 'API Key and Client ID are required' });
          return;
        }
        set({ connecting: true, connectError: null });
        try {
          const res = await fetch('/api/angel-one/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || 'Connection failed');
          set({
            accessToken: data.accessToken,
            feedToken: data.feedToken ?? '',
            isConnected: true,
            lastConnected: new Date().toISOString(),
            connecting: false,
          });
        } catch (err) {
          set({ connecting: false, connectError: String(err instanceof Error ? err.message : err) });
        }
      },

      disconnect: () => set({ isConnected: false, accessToken: '', feedToken: '', mode: 'paper' }),
    }),
    { name: 'angel-one', partialize: (s) => ({ credentials: s.credentials, mode: s.mode }) }
  )
);
