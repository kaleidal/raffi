const DEFAULT_SYNC_URL = 'https://sync.raffi.al';

const configuredSyncUrl = process.env.EXPO_PUBLIC_RAFFI_SYNC_URL;
const syncBaseUrl = (configuredSyncUrl && configuredSyncUrl.trim()
  ? configuredSyncUrl.trim()
  : DEFAULT_SYNC_URL
).replace(/\/+$/, '');

let authToken: string | null = null;

class RaffiSyncError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const getErrorMessage = async (response: Response) => {
  try {
    const body = await response.json();
    if (typeof body?.message === 'string' && body.message) return body.message;
    if (typeof body?.error === 'string' && body.error) return body.error;
  } catch {
  }
  return `Raffi Sync request failed (${response.status})`;
};

const normalizePath = (path: string) => path.startsWith('/') ? path : `/${path}`;

const syncRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${syncBaseUrl}${normalizePath(path)}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new RaffiSyncError(response.status, await getErrorMessage(response));
  }

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
};

export const setRaffiSyncAuthToken = (token: string | null) => {
  authToken = token;
};

export const syncGet = async <T = any>(path: string): Promise<T> => {
  return syncRequest<T>(path, { method: 'GET' });
};

export const syncPost = async <T = any>(path: string, body: Record<string, any> = {}): Promise<T> => {
  return syncRequest<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
};
