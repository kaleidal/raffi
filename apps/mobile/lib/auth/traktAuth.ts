import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { exchangeTraktCode, getTraktStatus, type TraktStatus } from '../db';

const generateState = () => {
  const random = Math.random().toString(36).slice(2);
  return `${Date.now()}-${random}`;
};

export async function signInWithTrakt(): Promise<TraktStatus> {
  const status = await getTraktStatus();
  if (!status.configured || !status.clientId) {
    throw new Error('Trakt is not configured yet');
  }

  const state = generateState();
  const redirectUri = status.redirectUri || 'raffi://trakt/callback';
  const authParams = new URLSearchParams({
    response_type: 'code',
    client_id: status.clientId,
    redirect_uri: redirectUri,
    state,
  });
  const authUrl = `${status.authorizeUrl}?${authParams.toString()}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type !== 'success' || !result.url) {
    throw new Error('Trakt sign-in was canceled');
  }

  const parsed = Linking.parse(result.url);
  const receivedCode = typeof parsed.queryParams?.code === 'string' ? parsed.queryParams.code : undefined;
  const receivedState = typeof parsed.queryParams?.state === 'string' ? parsed.queryParams.state : undefined;
  const receivedError = typeof parsed.queryParams?.error === 'string' ? parsed.queryParams.error : undefined;

  if (receivedError) {
    throw new Error(receivedError);
  }
  if (!receivedCode || !receivedState || receivedState !== state) {
    throw new Error('Invalid Trakt callback');
  }

  await exchangeTraktCode(receivedCode);
  return getTraktStatus();
}
