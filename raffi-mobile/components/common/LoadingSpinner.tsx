import { Colors, Spacing, Typography } from '@/constants/theme';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  message?: string;
  fullScreen?: boolean;
}

export default function LoadingSpinner({
  size = 'large',
  message,
  fullScreen = false,
}: LoadingSpinnerProps) {
  const content = (
    <View style={styles.container}>
      <ActivityIndicator
        size={size}
        color={Colors.primary}
      />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );

  if (fullScreen) {
    return <View style={styles.fullScreen}>{content}</View>;
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    marginTop: Spacing.md,
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
  },
});
