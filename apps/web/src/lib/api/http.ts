import { getApiBasePath } from '@/lib/runtime/mode';

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

let accessToken: string | null = null;

export function setApiAccessToken(token: string | null) {
  accessToken = token;
}

export function getApiAccessToken(): string | null {
  return accessToken;
}

function joinUrl(base: string, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

async function readErrorDetail(response: Response): Promise<unknown> {
  const ct = response.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) return await response.json();
    return await response.text();
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  init?: Omit<RequestInit, 'body'> & { body?: unknown; auth?: boolean },
): Promise<T> {
  const base = getApiBasePath();
  const url = joinUrl(base, path);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  };

  const shouldAuth = init?.auth !== false;
  const token = getApiAccessToken();
  if (shouldAuth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init?.headers || {}) },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const detail = await readErrorDetail(res);
    const message = typeof detail === 'string' && detail ? detail : `API ${res.status} ${res.statusText}`;
    throw new ApiError(message, res.status, detail);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}



