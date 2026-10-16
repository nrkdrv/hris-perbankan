/**
 * Klien HTTP ke backend NestJS (via rewrite /api -> :3001 di next.config.ts).
 * Menyimpan access token di memori; otomatis refresh saat 401 lalu ulangi request.
 */

const API_BASE = '/api/v1';

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function doRefresh(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return false;
  const data = await res.json();
  accessToken = data.accessToken ?? null;
  return !!accessToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const isForm = options.body instanceof FormData;
  if (!isForm && options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && retry && path !== '/auth/refresh') {
    if (!refreshPromise) refreshPromise = doRefresh().finally(() => (refreshPromise = null));
    const ok = await refreshPromise;
    if (ok) return api<T>(path, options, false);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      (data as { message?: string | string[] } | null)?.message ??
      `Request gagal (${res.status})`;
    throw new ApiError(
      res.status,
      Array.isArray(msg) ? msg.join(', ') : String(msg),
      (data as { code?: string } | null)?.code,
    );
  }
  return data as T;
}

export async function apiBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, `Unduhan gagal (${res.status})`);
  return res.blob();
}
