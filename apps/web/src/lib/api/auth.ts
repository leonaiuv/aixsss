import { apiRequest } from './http';

export type AuthTokenResponse = { accessToken: string };
export type AuthMeResponse = { userId: string; teamId: string; email: string };

export async function apiRegister(input: { email: string; password: string; teamName?: string }) {
  return apiRequest<AuthTokenResponse>('/auth/register', { method: 'POST', body: input, auth: false });
}

export async function apiLogin(input: { email: string; password: string }) {
  return apiRequest<AuthTokenResponse>('/auth/login', { method: 'POST', body: input, auth: false });
}

export async function apiMe() {
  return apiRequest<AuthMeResponse>('/auth/me', { method: 'GET' });
}



