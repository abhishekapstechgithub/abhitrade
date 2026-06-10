import Constants from 'expo-constants';
import { Platform } from 'react-native';

function getBaseUrl(): string {
  // Web browser → same host as Metro (localhost)
  if (Platform.OS === 'web') {
    return 'http://localhost:3000/api';
  }
  // Android emulator / physical device → from app.json extra
  return (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://10.0.2.2:3000/api';
}

const baseUrl = getBaseUrl();

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: Record<string, unknown> | FormData | string;
}

interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status: number;
  ok: boolean;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { body, headers, ...rest } = options;

  const isFormData = body instanceof FormData;
  const reqHeaders: HeadersInit = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(headers as Record<string, string> | undefined),
  };

  const reqBody =
    body == null
      ? undefined
      : isFormData
      ? body
      : typeof body === 'string'
      ? body
      : JSON.stringify(body);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      credentials: 'include',
      headers: reqHeaders,
      body: reqBody,
      ...rest,
    });

    let data: T | undefined;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      data = (await response.json()) as T;
    }

    return {
      data,
      status: response.status,
      ok: response.ok,
      error: response.ok ? undefined : ((data as { message?: string })?.message ?? response.statusText),
    };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

// Auth API
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string;
}

export interface SendOtpResponse {
  message: string;
  devOtp?: string;
}

export interface VerifyOtpResponse {
  user: AuthUser;
  token?: string;
}

export async function sendOtp(email: string): Promise<ApiResponse<SendOtpResponse>> {
  return apiRequest<SendOtpResponse>('/auth/send-otp', {
    method: 'POST',
    body: { email },
  });
}

export async function verifyOtp(
  email: string,
  otp: string
): Promise<ApiResponse<VerifyOtpResponse>> {
  return apiRequest<VerifyOtpResponse>('/auth/verify-otp', {
    method: 'POST',
    body: { email, otp },
  });
}

export async function registerUser(
  name: string,
  email: string,
  phone: string
): Promise<ApiResponse<SendOtpResponse>> {
  return apiRequest<SendOtpResponse>('/auth/register', {
    method: 'POST',
    body: { name, email, phone },
  });
}

export async function getMe(): Promise<ApiResponse<AuthUser>> {
  return apiRequest<AuthUser>('/auth/me', { method: 'GET' });
}

export async function logout(): Promise<ApiResponse<{ message: string }>> {
  return apiRequest<{ message: string }>('/auth/logout', { method: 'POST' });
}
