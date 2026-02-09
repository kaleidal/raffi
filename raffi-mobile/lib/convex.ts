import { ConvexHttpClient } from 'convex/browser';

const PROD_CONVEX_URL = 'https://qualified-meerkat-631.eu-west-1.convex.cloud';
const DEV_CONVEX_URL = 'https://nautical-poodle-361.eu-west-1.convex.cloud';
const CONVEX_URLS = __DEV__ ? [DEV_CONVEX_URL] : [PROD_CONVEX_URL];

const clients = new Map<string, ConvexHttpClient>();
let activeUrl = CONVEX_URLS[0];
let authToken: string | null = null;

const getClient = (url: string) => {
  let client = clients.get(url);
  if (!client) {
    client = new ConvexHttpClient(url, { logger: false });
    if (authToken) {
      client.setAuth(authToken);
    }
    clients.set(url, client);
  }
  return client;
};

const shouldAttemptFailover = (error: any) => {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('not authenticated') || message.includes('forbidden') || message.includes('unauthorized')) {
    return false;
  }
  return true;
};

const withFailover = async <T>(op: (client: ConvexHttpClient) => Promise<T>): Promise<T> => {
  const attempted = new Set<string>();
  let lastError: any = null;

  for (const candidate of [activeUrl, ...CONVEX_URLS]) {
    if (attempted.has(candidate)) continue;
    attempted.add(candidate);
    try {
      const result = await op(getClient(candidate));
      activeUrl = candidate;
      return result;
    } catch (error) {
      lastError = error;
      if (!shouldAttemptFailover(error)) {
        throw error;
      }
    }
  }

  throw lastError;
};

export const setConvexAuthToken = (token: string | null) => {
  authToken = token;
  for (const instance of clients.values()) {
    if (token) {
      instance.setAuth(token);
    } else {
      instance.clearAuth();
    }
  }
};

export const convexQuery = async <T = any>(name: string, args: Record<string, any> = {}): Promise<T> => {
  return withFailover((instance) => instance.query(name as any, args as any) as Promise<T>);
};

export const convexMutation = async <T = any>(name: string, args: Record<string, any> = {}): Promise<T> => {
  return withFailover((instance) => instance.mutation(name as any, args as any) as Promise<T>);
};

export const convexAction = async <T = any>(name: string, args: Record<string, any> = {}): Promise<T> => {
  return withFailover((instance) => instance.action(name as any, args as any) as Promise<T>);
};
