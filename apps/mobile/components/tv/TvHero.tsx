import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import TvFocusable from './TvFocusable';
import type { TvTitleItem } from './TvContentRow';

interface TvHeroProps {
  item: TvTitleItem;
  onPlay: () => void;
  onMore: () => void;
}

export default function TvHero({ item, onPlay, onMore }: TvHeroProps) {
  const { height, width } = useWindowDimensions();
  const heroHeight = Math.max(390, Math.round(height * 0.58));
  const imageSource = item.background || item.poster || '';

  return (
    <View style={[styles.container, { height: heroHeight }]}>
      {imageSource ? (
        <Image
          source={{ uri: imageSource }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={imageSource}
          style={styles.background}
        />
      ) : null}
      <LinearGradient
        colors={['rgba(9,9,9,0.12)', 'rgba(9,9,9,0.68)', Colors.background]}
        locations={[0, 0.56, 1]}
        style={styles.gradient}
      >
        <View style={[styles.content, { maxWidth: Math.min(680, width * 0.55) }]}>
          {item.background && item.poster ? (
            <Image
              source={{ uri: item.poster }}
              style={styles.poster}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={item.poster}
            />
          ) : null}
          <Text style={styles.title} numberOfLines={2}>{item.name}</Text>
          <View style={styles.metaRow}>
            {item.year ? <Text style={styles.meta}>{item.year}</Text> : null}
            {item.imdbRating ? <Text style={styles.meta}>{item.imdbRating}</Text> : null}
          </View>
          <View style={styles.actions}>
            <TvFocusable
              hasTVPreferredFocus
              style={styles.primaryButton}
              focusedStyle={styles.primaryFocused}
              pressedStyle={styles.pressed}
              onPress={onPlay}
            >
              <Ionicons name="play" size={24} color="#000" />
              <Text style={styles.primaryText}>Play</Text>
            </TvFocusable>
            <TvFocusable
              style={styles.secondaryButton}
              focusedStyle={styles.secondaryFocused}
              pressedStyle={styles.pressed}
              onPress={onMore}
            >
              <Ionicons name="information-circle-outline" size={24} color={Colors.text} />
              <Text style={styles.secondaryText}>Details</Text>
            </TvFocusable>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: Colors.background,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  gradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.xxxl,
    paddingBottom: Spacing.xxxl,
  },
  content: {
    gap: Spacing.md,
  },
  poster: {
    width: 92,
    height: 138,
    borderRadius: BorderRadius.md,
  },
  title: {
    color: Colors.text,
    fontSize: 52,
    fontWeight: Typography.weights.bold,
    lineHeight: 58,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  meta: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.medium,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  primaryButton: {
    minWidth: 150,
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  primaryFocused: {
    transform: [{ scale: 1.07 }],
  },
  primaryText: {
    color: Colors.background,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  secondaryButton: {
    minWidth: 150,
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glassStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  secondaryFocused: {
    backgroundColor: Colors.cardHover,
    transform: [{ scale: 1.07 }],
  },
  secondaryText: {
    color: Colors.text,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  pressed: {
    opacity: 0.9,
  },
});
