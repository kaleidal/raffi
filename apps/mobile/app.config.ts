import type { ExpoConfig } from 'expo/config';

const isTV = process.env.EXPO_TV === '1';

export default (): ExpoConfig => ({
  name: isTV ? 'Raffi TV' : 'Raffi',
  slug: 'raffi-mobile',
  owner: 'krissedout',
  version: '2.0.0',
  orientation: isTV ? 'landscape' : 'default',
  icon: './assets/images/icon.png',
  scheme: 'raffi',
  userInterfaceStyle: 'dark',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'al.kaleid.mobile',
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      NSLocalNetworkUsageDescription: 'Raffi discovers and securely connects to Raffi Desktop on your Wi-Fi network.',
      NSBonjourServices: ['_raffi._tcp'],
    },
  },
  android: {
    package: 'al.kaleid.raffimobile',
    predictiveBackGestureEnabled: true,
    permissions: ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE', 'android.permission.ACCESS_WIFI_STATE', 'android.permission.CHANGE_WIFI_MULTICAST_STATE'],
    adaptiveIcon: {
      backgroundColor: '#08090b',
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-camera', { cameraPermission: 'Allow Raffi to scan a Raffi Desktop pairing code.' }],
    ['expo-splash-screen', { image: './assets/images/splash-icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: '#08090b' }],
    ['@react-native-tvos/config-tv', { isTV }],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    isTV,
    eas: { projectId: 'a5ae0cf5-ea4d-4729-93ed-4ccb2e51e1b8' },
  },
});
