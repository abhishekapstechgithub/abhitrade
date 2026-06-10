import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'abhitrade_session';
const USER_KEY = 'abhitrade_user';

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  phone: string;
}

export async function saveUser(user: StoredUser): Promise<void> {
  try {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } catch {
    // SecureStore unavailable on web simulator — silently ignore
  }
}

export async function loadUser(): Promise<StoredUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export async function clearUser(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(USER_KEY);
  } catch {
    // ignore
  }
}

export async function saveSession(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, token);
  } catch {
    // ignore
  }
}

export async function loadSession(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // ignore
  }
}

export async function clearAll(): Promise<void> {
  await Promise.all([clearUser(), clearSession()]);
}
