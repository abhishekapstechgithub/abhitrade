import { create } from 'zustand';
import { saveUser, loadUser, clearAll, type StoredUser } from '@/lib/storage';

interface AuthState {
  user: StoredUser | null;
  isLoading: boolean;
  isHydrated: boolean;
  setUser: (user: StoredUser) => Promise<void>;
  clearUser: () => Promise<void>;
  hydrateFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isHydrated: false,

  setUser: async (user: StoredUser) => {
    await saveUser(user);
    set({ user });
  },

  clearUser: async () => {
    await clearAll();
    set({ user: null });
  },

  hydrateFromStorage: async () => {
    set({ isLoading: true });
    try {
      const stored = await loadUser();
      set({ user: stored, isHydrated: true, isLoading: false });
    } catch {
      set({ user: null, isHydrated: true, isLoading: false });
    }
  },
}));
