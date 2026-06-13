import { BorderRadius, Colors, PosterSize, Spacing, Typography } from '@/constants/theme';
import type { Meta, PopularTitleMeta } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    type ViewStyle,
} from 'react-native';

interface PosterCardProps {
  item: PopularTitleMeta | Meta | { imdb_id: string; poster?: string; name?: string; type?: string };
  size?: 'small' | 'medium' | 'large';
  showTitle?: boolean;
  showRating?: boolean;
  onPress?: () => void;
  containerStyle?: ViewStyle;
  dimensionsOverride?: { width: number; height: number };
}

export default function PosterCard({
  item,
  size = 'medium',
  showTitle = true,
  showRating = false,
  onPress,
  containerStyle,
  dimensionsOverride,
}: PosterCardProps) {
  const dimensions = dimensionsOverride ?? PosterSize[size];
  const poster = item.poster;
  const name = item.name || 'Unknown';
  const rating = (item as any).imdbRating;
  const type = (item as any).type || 'movie';
  const imdbId = (item as any).imdb_id || (item as any).id;

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push({
        pathname: '/meta/[id]',
        params: {
          id: imdbId,
          type: type,
          name: name,
        },
      });
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, { width: dimensions.width }, containerStyle]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={[styles.posterWrapper, { height: dimensions.height }]}>
        {poster ? (
          <Image
            source={{ uri: poster }}
            style={[styles.poster, { width: dimensions.width, height: dimensions.height }]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.placeholder, { width: dimensions.width, height: dimensions.height }]}>
            <Ionicons name="film-outline" size={40} color={Colors.textMuted} />
          </View>
        )}

        {showRating && rating && (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color={Colors.warning} />
            <Text style={styles.ratingText}>{rating}</Text>
          </View>
        )}
      </View>

      {showTitle && (
        <Text style={styles.title} numberOfLines={2}>
          {name}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: Spacing.sm,
  },
  posterWrapper: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  poster: {
    borderRadius: BorderRadius.lg,
  },
  placeholder: {
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  ratingText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
  },
  title: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
});
