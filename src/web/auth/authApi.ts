// Client for the hub's /api/v1/auth and /api/v1/admin endpoints. Same-origin cookies
// carry the session; state-changing calls send the CSRF token from the session response.

export interface MeResponse {
  authenticated: boolean;
  needsSetup: boolean;
  requireAuth: boolean;
  enableApiKeys: boolean;
  needsMfaPolicy: boolean;
  authLevel: 'password' | 'mfa' | null;
  csrfToken: string | null;
  user: AuthUser | null;
  mfa: { required: boolean; enroll: boolean; methods: ('totp' | 'webauthn')[] } | null;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  name: string | null;
  role: 'admin' | 'user';
  hasPassword: boolean;
  totpEnabled: boolean;
  hasPasskey?: boolean;
  enabled: boolean;
}

export interface ApiKey {
  id: number;
  prefix: string;
  label: string | null;
  enabled: boolean;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, csrf?: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf;
  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON body (e.g. a proxy's HTML error page) shouldn't surface as a raw
    // SyntaxError; fall back to a status-based message below.
    json = null;
  }
  if (!res.ok) {
    const msg = (json as { detail?: string; error?: string })?.detail ?? (json as { error?: string })?.error ?? `request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return json as T;
}

const A = '/api/v1/auth';

export const authApi = {
  me: () => request<MeResponse>('GET', `${A}/session`),
  setup: (b: { username: string; password: string; email?: string; name?: string }) =>
    request<{ next: string }>('POST', `${A}/setup`, b),
  login: (username: string, password: string) =>
    request<{ next: 'ok' | 'mfa' | 'enroll_mfa'; methods: string[] }>('POST', `${A}/login`, { username, password }),
  logout: (csrf: string) => request('POST', `${A}/logout`, {}, csrf),
  setMfaPolicy: (roles: string[], csrf: string) => request('POST', `${A}/mfa/policy`, { roles }, csrf),
  totpEnroll: (csrf: string) => request<{ secret: string; uri: string; qr: string }>('POST', `${A}/mfa/totp`, {}, csrf),
  totpActivate: (code: string, csrf: string) => request('POST', `${A}/mfa/totp/activation`, { code }, csrf),
  mfaTotp: (code: string, csrf: string, rememberDevice = false) =>
    request('POST', `${A}/mfa/totp/verification`, { code, rememberDevice }, csrf),
  passkeyRegisterOptions: (csrf: string) => request<{ publicKey: unknown }>('POST', `${A}/mfa/passkeys/registration`, {}, csrf),
  passkeyRegisterVerify: (response: unknown, label: string | null, csrf: string) =>
    request('POST', `${A}/mfa/passkeys`, { response, label }, csrf),
  passkeyLoginOptions: (csrf: string) => request<{ publicKey: unknown }>('POST', `${A}/mfa/passkeys/challenge`, {}, csrf),
  passkeyLoginVerify: (response: unknown, csrf: string, rememberDevice = false) =>
    request('POST', `${A}/mfa/passkeys/verification${rememberDevice ? '?remember=true' : ''}`, response, csrf),
  totpDisable: (csrf: string) => request('DELETE', `${A}/mfa/totp`, undefined, csrf),
  forgetDevices: (csrf: string) => request('DELETE', `${A}/trusted-devices`, undefined, csrf),
  passkeys: () =>
    request<{ passkeys: { id: number; label: string | null; createdAt: number; lastUsedAt: number | null }[] }>('GET', `${A}/mfa/passkeys`),
  deletePasskey: (id: number, csrf: string) => request('DELETE', `${A}/mfa/passkeys/${id}`, undefined, csrf),
  changePassword: (currentPassword: string, newPassword: string, csrf: string) =>
    request('POST', `${A}/password`, { currentPassword, newPassword }, csrf),
  apiKeys: () => request<{ apiKeys: ApiKey[] }>('GET', `${A}/api-keys`),
  createApiKey: (b: { label?: string; expiresAt?: number }, csrf: string) =>
    request<{ key: string; apiKey: ApiKey }>('POST', `${A}/api-keys`, b, csrf),
  updateApiKey: (id: number, enabled: boolean, csrf: string) =>
    request<{ apiKey: ApiKey }>('PATCH', `${A}/api-keys/${id}`, { enabled }, csrf),
  deleteApiKey: (id: number, csrf: string) => request('DELETE', `${A}/api-keys/${id}`, undefined, csrf),
};

export interface AdminAgent {
  id: number;
  provisionId: string | null;
  region: string;
  provider: string;
  platform: string;
  label: string | null;
  enabled: boolean;
  source: 'manual' | 'provisioned';
  pollMin: string | null;
  pollMax: string | null;
  readings: number;
  lastReadingAt: number | null;
}

export interface AdminSettings {
  mfaEnforcedRoles: ('admin' | 'user')[];
  requireAuth: boolean;
  enableApiKeys: boolean;
}

const ADM = '/api/v1/admin';

export const adminApi = {
  online: () => request<{ online: number }>('GET', `${ADM}/presence`),
  listAgents: () => request<{ agents: AdminAgent[] }>('GET', `${ADM}/agents`),
  createAgent: (b: { region: string; provider: string; label?: string }, csrf: string) =>
    request<{ agent: AdminAgent; token: string }>('POST', `${ADM}/agents`, b, csrf),
  updateAgent: (id: number, b: { label?: string | null; provider?: string }, csrf: string) =>
    request<{ agent: AdminAgent }>('PATCH', `${ADM}/agents/${id}`, b, csrf),
  setEnabled: (id: number, enabled: boolean, csrf: string) =>
    request('PATCH', `${ADM}/agents/${id}`, { enabled }, csrf),
  regenerateToken: (id: number, csrf: string) =>
    request<{ token: string }>('POST', `${ADM}/agents/${id}/token`, {}, csrf),
  changeRegion: (id: number, region: string, dataMode: 'keep' | 'orphan' | 'delete', csrf: string) =>
    request('PATCH', `${ADM}/agents/${id}`, { region, dataMode }, csrf),
  deleteAgent: (id: number, dataMode: 'orphan' | 'delete', csrf: string) =>
    request('DELETE', `${ADM}/agents/${id}?dataMode=${dataMode}`, undefined, csrf),
  deleteOrphans: (csrf: string) => request<{ removed: number }>('DELETE', `${ADM}/readings/orphans`, undefined, csrf),
  exportAgents: () => request<{ agents: unknown[] }>('GET', `${ADM}/agents/export`),
  importAgents: (agents: unknown[], csrf: string) =>
    request<{ imported: number; skipped: { index: number; provisionId: string | null; reason: string }[] }>(
      'POST',
      `${ADM}/agents/import`,
      { agents },
      csrf,
    ),
  getSettings: () => request<AdminSettings>('GET', `${ADM}/settings`),
  putSettings: (b: Partial<AdminSettings>, csrf: string) => request<AdminSettings>('PATCH', `${ADM}/settings`, b, csrf),
  listUsers: () => request<{ users: AuthUser[] }>('GET', `${ADM}/users`),
  createUser: (
    b: { username: string; password: string; role: 'admin' | 'user'; email?: string; name?: string },
    csrf: string,
  ) => request<{ user: AuthUser }>('POST', `${ADM}/users`, b, csrf),
  setUserRole: (id: number, role: 'admin' | 'user', csrf: string) =>
    request('PATCH', `${ADM}/users/${id}`, { role }, csrf),
  setUserEnabled: (id: number, enabled: boolean, csrf: string) =>
    request('PATCH', `${ADM}/users/${id}`, { enabled }, csrf),
  resetUserMfa: (id: number, csrf: string) => request('DELETE', `${ADM}/users/${id}/mfa`, undefined, csrf),
  deleteUser: (id: number, csrf: string) => request('DELETE', `${ADM}/users/${id}`, undefined, csrf),
};
