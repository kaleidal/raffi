import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type ViewProps } from 'react-native';

export function GlassSurface({ children, style, ...props }: ViewProps) {
  const [reduceTransparency, setReduceTransparency] = React.useState(false);
  React.useEffect(() => { void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency); }, []);
  if (Platform.OS === 'ios' && !reduceTransparency && isGlassEffectAPIAvailable() && isLiquidGlassAvailable()) {
    return <GlassView {...props} isInteractive style={[styles.surface, style]}>{children}</GlassView>;
  }
  if (!reduceTransparency) {
    return <BlurView {...props} intensity={55} tint="dark" experimentalBlurMethod="dimezisBlurView" style={[styles.surface, style]}>{children}</BlurView>;
  }
  return <View {...props} style={[styles.surface, styles.opaque, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: { overflow: 'hidden', backgroundColor: 'rgba(20,22,27,0.68)', borderColor: 'rgba(255,255,255,0.16)', borderWidth: StyleSheet.hairlineWidth },
  opaque: { backgroundColor: '#181a1f' },
});
