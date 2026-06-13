import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

const icon = require('../../assets/images/icon.png');

interface TvBrandMarkProps {
  size?: number;
}

export default function TvBrandMark({ size = 44 }: TvBrandMarkProps) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.24 }]}>
      <Image source={icon} style={styles.icon} contentFit="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: Colors.backgroundTertiary,
  },
  icon: {
    width: '100%',
    height: '100%',
  },
});
