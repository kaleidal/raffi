import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import {
  buildStreamPresentation,
  getStreamPlaybackSource,
} from '@/lib/streams/streamPresentation';
import type { Stream } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import TvFocusable from './TvFocusable';

interface TvSourceListProps {
  streams: Stream[];
  onSelect: (stream: Stream) => void;
  preferredFirstFocus?: boolean;
}

export default function TvSourceList({
  streams,
  onSelect,
  preferredFirstFocus = false,
}: TvSourceListProps) {
  const rows = useMemo(
    () => streams.map((stream, index) => ({
      key: `${stream.infoHash || stream.url || 'stream'}-${index}`,
      stream,
      meta: buildStreamPresentation(stream),
      playable: Boolean(getStreamPlaybackSource(stream)),
    })),
    [streams]
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.key}
      scrollEnabled={false}
      contentContainerStyle={styles.list}
      renderItem={({ item, index }) => (
        <TvFocusable
          hasTVPreferredFocus={preferredFirstFocus && index === 0}
          disabled={!item.playable}
          style={[styles.row, !item.playable ? styles.rowDisabled : null]}
          focusedStyle={styles.rowFocused}
          onPress={() => onSelect(item.stream)}
        >
          <View style={styles.main}>
            <View style={styles.titleRow}>
              <Text style={styles.provider}>{item.meta.providerLabel}</Text>
              {item.meta.statusLabels.slice(0, 3).map((label) => (
                <View key={label} style={styles.badge}>
                  <Text style={styles.badgeText}>{label}</Text>
                </View>
              ))}
            </View>
            {item.meta.detailLine ? (
              <Text style={styles.detail} numberOfLines={2}>{item.meta.detailLine}</Text>
            ) : null}
            <View style={styles.features}>
              {item.meta.featureLabels.slice(0, 6).map((label) => (
                <Text key={label} style={styles.feature}>{label}</Text>
              ))}
              {item.meta.peerCount != null ? (
                <Text style={styles.feature}>{item.meta.peerCount} peers</Text>
              ) : null}
            </View>
          </View>
          <Ionicons name="play-circle" size={34} color={Colors.text} />
        </TvFocusable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.md,
  },
  row: {
    minHeight: 108,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.backgroundTertiary,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xl,
  },
  rowFocused: {
    backgroundColor: Colors.cardHover,
    transform: [{ scale: 1.02 }],
  },
  rowDisabled: {
    opacity: 0.45,
  },
  main: {
    flex: 1,
    gap: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  provider: {
    color: Colors.text,
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glassStrong,
  },
  badgeText: {
    color: Colors.text,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  detail: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.md,
    lineHeight: 20,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  feature: {
    color: Colors.textMuted,
    fontSize: Typography.sizes.sm,
  },
});
