import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageStyle } from 'expo-image';
import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import TvFocusable from './TvFocusable';

const POSTER_WIDTH = 142;
const POSTER_HEIGHT = 213;
const ITEM_GAP = Spacing.lg;

export interface TvTitleItem {
  id: string;
  imdb_id: string;
  name: string;
  type: string;
  poster?: string | null;
  background?: string | null;
  year?: string | null;
  imdbRating?: string | null;
}

interface TvContentRowProps {
  title: string;
  items: TvTitleItem[];
  onPressItem: (item: TvTitleItem) => void;
  preferredFirstFocus?: boolean;
  posterStyle?: ImageStyle;
}

export default function TvContentRow({
  title,
  items,
  onPressItem,
  preferredFirstFocus = false,
  posterStyle,
}: TvContentRowProps) {
  if (!items.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.imdb_id || item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        removeClippedSubviews
        updateCellsBatchingPeriod={80}
        windowSize={3}
        getItemLayout={(_, index) => ({
          length: POSTER_WIDTH + ITEM_GAP,
          offset: (POSTER_WIDTH + ITEM_GAP) * index,
          index,
        })}
        renderItem={({ item, index }) => (
          <TvFocusable
            hasTVPreferredFocus={preferredFirstFocus && index === 0}
            style={styles.card}
            focusedStyle={styles.cardFocused}
            pressedStyle={styles.cardPressed}
            onPress={() => onPressItem(item)}
          >
            <View style={styles.posterWrap}>
              {item.poster ? (
                <Image
                  source={{ uri: item.poster }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={item.poster}
                  style={[styles.poster, posterStyle]}
                />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]}>
                  <Ionicons name="film-outline" size={38} color={Colors.textMuted} />
                </View>
              )}
            </View>
            <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
            <View style={styles.metaRow}>
              {item.year ? <Text style={styles.meta}>{item.year}</Text> : null}
              {item.imdbRating ? (
                <Text style={styles.meta}>{item.imdbRating}</Text>
              ) : null}
            </View>
          </TvFocusable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    paddingHorizontal: Spacing.xxxl,
  },
  list: {
    gap: ITEM_GAP,
    paddingHorizontal: Spacing.xxxl,
    paddingBottom: Spacing.lg,
  },
  card: {
    width: POSTER_WIDTH,
    gap: Spacing.sm,
    transform: [{ scale: 1 }],
  },
  cardFocused: {
    transform: [{ scale: 1.05 }],
  },
  cardPressed: {
    opacity: 0.9,
  },
  posterWrap: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.backgroundTertiary,
  },
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: Colors.text,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  meta: {
    color: Colors.textMuted,
    fontSize: Typography.sizes.sm,
  },
});
