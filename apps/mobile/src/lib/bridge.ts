import type { BridgeInfo, BridgePlaybackRequest, BridgePlaybackSession, DevicePlatform, PairResponse } from '@raffi/shared';
import { NativeModules, Platform } from 'react-native';

export interface PairedDesktop {
  id: string;
  name: string;
  baseUrl: string;
  deviceId: string;
  online?: boolean;
}

function normalizeBaseUrl(value: string) {
  const raw = value.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
}

async function jsonRequest<T>(baseUrl: string, path: string, options: RequestInit = {}) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    ...options,
    headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) },
  });
  if (!response.ok) throw new Error((await response.text()) || `Desktop request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export const getBridgeInfo = (baseUrl: string) => jsonRequest<BridgeInfo>(baseUrl, '/bridge/v1/info');

export async function pairDesktop(baseUrl: string, challenge: string, deviceName: string, platform: DevicePlatform) {
  return jsonRequest<PairResponse>(baseUrl, '/bridge/v1/pair', { method: 'POST', body: JSON.stringify({ challenge, deviceName, platform }) });
}

export async function createBridgePlayback(baseUrl: string, token: string, request: BridgePlaybackRequest) {
  return jsonRequest<BridgePlaybackSession>(baseUrl, '/bridge/v1/playback/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(request),
  });
}

export async function deleteBridgePlayback(baseUrl: string, token: string, id: string) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/bridge/v1/playback/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  if (!response.ok && response.status !== 404) throw new Error(`Could not close desktop playback (${response.status})`);
}

export function parsePairingPayload(value: string): { baseUrl: string; challenge: string } {
  const url = new URL(value);
  if (url.protocol !== 'raffi:' || url.hostname !== 'pair') throw new Error('That is not a Raffi pairing code');
  const baseUrl = url.searchParams.get('url');
  const challenge = url.searchParams.get('code');
  if (!baseUrl || !challenge) throw new Error('Pairing code is incomplete');
  return { baseUrl, challenge };
}

export type DiscoveredDesktop = { name: string; host: string; port: number; baseUrl: string };

export function discoverDesktops(onDesktop: (desktop: DiscoveredDesktop) => void): () => void {
  if (!NativeModules.RNZeroconf) return () => undefined;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Zeroconf = require('react-native-zeroconf').default ?? require('react-native-zeroconf');
  const zeroconf = new Zeroconf();
  const onResolved = (service: any) => {
    const host = service.host || service.addresses?.find((address: string) => address.includes('.'));
    if (!host || !service.port) return;
    onDesktop({ name: service.name || 'Raffi Desktop', host, port: service.port, baseUrl: `http://${host}:${service.port}` });
  };
  zeroconf.on('resolved', onResolved);
  zeroconf.scan('raffi', 'tcp', 'local.');
  return () => { try { zeroconf.stop(); zeroconf.removeListener('resolved', onResolved); } catch {} };
}

export const localDeviceName = `${Platform.OS === 'ios' ? 'iPhone' : Platform.isTV ? 'Raffi TV' : 'Android'} Raffi`;
