'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string;
}

interface AuthStore {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
  /** Derive 2-letter initials from name, e.g. "Rahul Sharma" → "RS" */
  getInitials: () => string;
  /** First name only for the header display */
  getFirstName: () => string;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,

      setUser: (user) => set({ user }),

      clearUser: () => set({ user: null }),

      getInitials: () => {
        const name = get().user?.name ?? '';
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return 'AT';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      },

      getFirstName: () => {
        const name = get().user?.name ?? '';
        return name.trim().split(/\s+/)[0] || 'User';
      },
    }),
    { name: 'at-auth-user' },
  ),
);
