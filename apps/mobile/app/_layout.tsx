import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '@/state/AppContext';

function Router() {
  const { ready } = useApp();
  if (!ready) return <View className="flex-1 items-center justify-center bg-canvas"><ActivityIndicator color="white" /></View>;
  return <><StatusBar style="light" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#08090b' }, animation: 'fade' }} /></>;
}

export default function RootLayout() {
  return <SafeAreaProvider><AppProvider><Router /></AppProvider></SafeAreaProvider>;
}
