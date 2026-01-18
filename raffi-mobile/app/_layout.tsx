import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/lib/stores/authStore';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const { initAuth, initialized, loading } = useAuthStore();

  useEffect(() => {
    initAuth();
  }, []);

  if (!initialized || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="meta/[id]"
            options={{
              presentation: 'card',
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="player"
            options={{
              presentation: 'fullScreenModal',
              animation: 'fade',
            }}
          />
          <Stack.Screen
            name="lists"
            options={{
              presentation: 'card',
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="addons"
            options={{
              presentation: 'card',
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="history"
            options={{
              presentation: 'card',
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="login"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack>
        <StatusBar style="light" backgroundColor={Colors.background} translucent={false} />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
