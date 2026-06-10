import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { getMe } from '@/lib/api';

/**
 * On app start, hydrates the auth store from SecureStore, then
 * calls GET /api/auth/me to verify the session is still valid.
 * If the server returns 401, the local user is cleared (forces login).
 */
export function useSession() {
  const { hydrateFromStorage, clearUser, setUser, isHydrated } = useAuthStore();
  const verified = useRef(false);

  useEffect(() => {
    void hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    if (!isHydrated || verified.current) return;
    verified.current = true;

    void (async () => {
      const res = await getMe();
      if (res.ok && res.data) {
        await setUser(res.data);
      } else if (res.status === 401) {
        await clearUser();
      }
      // For non-network errors (status 0 / no server) keep whatever is in storage
    })();
  }, [isHydrated, clearUser, setUser]);
}
