import { exchangeCode, fetchUserInfo } from '@ave-id/sdk';
import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { AppUser } from '@/state/AppContext';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = 'app_13afc5b8884e9985d89eac0f4ca4b5af';
const ISSUER = 'https://aveid.net';

const base64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const nonce = () => base64Url(Crypto.getRandomBytes(32));

function decodeClaims(token: string): Record<string, any> {
  try {
    const value = token.split('.')[1];
    if (!value) return {};
    return JSON.parse(Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch { return {}; }
}

export async function signIn(): Promise<AppUser> {
  const redirectUri = Linking.createURL('auth/callback');
  const verifier = nonce();
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
  const challenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const state = nonce().slice(0, 32);
  const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: redirectUri, scope: 'openid profile email', state, nonce: nonce().slice(0, 32), code_challenge: challenge, code_challenge_method: 'S256' });
  const result = await WebBrowser.openAuthSessionAsync(`${ISSUER}/signin?${params}`, redirectUri);
  if (result.type !== 'success') throw new Error('Sign-in was cancelled');
  const callback = Linking.parse(result.url);
  if (callback.queryParams?.state !== state || typeof callback.queryParams.code !== 'string') throw new Error('Invalid sign-in response');
  const tokens: any = await exchangeCode({ clientId: CLIENT_ID, redirectUri, issuer: ISSUER }, { code: callback.queryParams.code, codeVerifier: verifier });
  const token = tokens.id_token || tokens.access_token_jwt || tokens.access_token;
  if (!token) throw new Error('No account token was returned');
  let profile: any = {};
  if (tokens.access_token) try { profile = await fetchUserInfo({ clientId: CLIENT_ID, redirectUri, issuer: ISSUER }, tokens.access_token); } catch {}
  const claims = decodeClaims(token);
  const id = String(profile.sub || claims.sub || '');
  if (!id) throw new Error('Could not identify the signed-in account');
  return { id, token, name: profile.name || claims.name || null, email: profile.email || claims.email || null };
}
