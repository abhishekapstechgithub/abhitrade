'use client';
import { useEffect } from 'react';

/** On mount, ensure tk_access_token is in localStorage for strategy-api calls. */
export function TokenAutoFetch() {
  useEffect(() => {
    const existing = sessionStorage.getItem('tk_access_token') ?? localStorage.getItem('tk_access_token');
    if (existing) return;
    fetch('/api/auth/me/token')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.accessToken) {
          try { localStorage.setItem('tk_access_token', data.accessToken); } catch { /* ignore */ }
        }
      })
      .catch(() => { /* user not logged in yet */ });
  }, []);
  return null;
}
