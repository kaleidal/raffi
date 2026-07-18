import { Platform } from 'react-native';

export const isTV = Boolean(Platform.isTV);
export const devicePlatform = isTV ? 'android-tv' : Platform.OS === 'ios' ? 'ios' : 'android';
