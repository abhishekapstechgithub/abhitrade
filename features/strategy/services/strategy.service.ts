import { Strategy } from '../types/strategy.types';

const BASE = '/api/strategies';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

export const strategyService = {
  list(): Promise<{ strategies: Strategy[] }> {
    return request(`${BASE}`);
  },

  get(id: string): Promise<{ strategy: Strategy }> {
    return request(`${BASE}/${id}`);
  },

  create(data: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ strategy: Strategy }> {
    return request(BASE, { method: 'POST', body: JSON.stringify(data) });
  },

  update(id: string, data: Partial<Strategy>): Promise<{ strategy: Strategy }> {
    return request(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  remove(id: string): Promise<void> {
    return request(`${BASE}/${id}`, { method: 'DELETE' });
  },

  deploy(id: string): Promise<{ strategy: Strategy }> {
    return request(`${BASE}/${id}/deploy`, { method: 'POST' });
  },

  clone(id: string): Promise<{ strategy: Strategy }> {
    return request(`${BASE}/${id}/clone`, { method: 'POST' });
  },
};
