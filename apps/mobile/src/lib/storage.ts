import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const PREFIX = 'raffi:v2:';

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const value = await AsyncStorage.getItem(`${PREFIX}${key}`);
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function writeJson(key: string, value: unknown) {
  await AsyncStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
}

export async function readSecret(key: string) {
  return SecureStore.getItemAsync(`${PREFIX}${key}`);
}

export async function writeSecret(key: string, value: string | null) {
  if (value === null) return SecureStore.deleteItemAsync(`${PREFIX}${key}`);
  return SecureStore.setItemAsync(`${PREFIX}${key}`, value);
}
