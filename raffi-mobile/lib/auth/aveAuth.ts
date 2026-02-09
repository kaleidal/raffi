import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Buffer } from 'buffer';
import {
  exchangeCode,
  fetchUserInfo,
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
} from '@ave-id/sdk';
import type { AppUser } from './types';

const AVE_CLIENT_ID = 'app_13afc5b8884e9985d89eac0f4ca4b5af';
const AVE_ISSUER = 'https://api.aveid.net';
const AVE_SIGNIN_URL = 'https://aveid.net/signin';

const decodeJwtPayload = (token: string): Record<string, any> | null => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

export async function signInWithAve(): Promise<AppUser> {
  const redirectUri = Linking.createURL('/auth/callback');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateNonce();
  const nonce = generateNonce();

  const authParams = new URLSearchParams({
    client_id: AVE_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  const authUrl = `${AVE_SIGNIN_URL}?${authParams.toString()}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type !== 'success' || !result.url) {
    throw new Error('Ave sign-in was canceled');
  }

  const parsed = Linking.parse(result.url);
  const receivedCode = typeof parsed.queryParams?.code === 'string' ? parsed.queryParams.code : undefined;
  const receivedState = typeof parsed.queryParams?.state === 'string' ? parsed.queryParams.state : undefined;
  const receivedError = typeof parsed.queryParams?.error === 'string' ? parsed.queryParams.error : undefined;

  if (receivedError) {
    throw new Error(receivedError);
  }
  if (!receivedCode || !receivedState || receivedState !== state) {
    throw new Error('Invalid Ave callback');
  }

  const tokens = await exchangeCode(
    {
      clientId: AVE_CLIENT_ID,
      redirectUri,
      issuer: AVE_ISSUER,
    },
    {
      code: receivedCode,
      codeVerifier,
    }
  );

  const jwtToken = (tokens as any).id_token || (tokens as any).access_token_jwt || (tokens as any).access_token;
  if (!jwtToken) {
    throw new Error('Ave token exchange did not return a JWT token');
  }

  const accessToken = (tokens as any).access_token;
  let profile: any = null;
  if (accessToken) {
    try {
      profile = await fetchUserInfo(
        {
          clientId: AVE_CLIENT_ID,
          redirectUri,
          issuer: AVE_ISSUER,
        },
        accessToken
      );
    } catch {
      profile = null;
    }
  }

  const claims = decodeJwtPayload(jwtToken) || {};
  const id = String(profile?.sub || claims.sub || '');
  if (!id) {
    throw new Error('Unable to resolve Ave user id');
  }

  return {
    id,
    email: profile?.email || claims.email || null,
    name: profile?.name || profile?.preferred_username || claims.name || null,
    avatar: profile?.picture || claims.picture || null,
    provider: 'ave',
    token: jwtToken,
  };
}
