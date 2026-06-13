import { BorderRadius, Colors, PosterSize, Spacing, Typography } from '@/constants/theme';
import type { LibraryItemWithMeta } from '@/lib/stores/libraryStore';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface ContinueWatchingProps {
  items: LibraryItemWithMeta[];
  onHide?: (imdbId: string) => void;
}

export default function ContinueWatching({ items, onHide }: ContinueWatchingProps) {
  const handlePress = (item: LibraryItemWithMeta) => {
    router.push({
      pathname: '/meta/[id]',
      params: {
        id: item.imdb_id,
        type: item.type,
        name: item.meta?.meta?.name || '',
        autoPlay: 'true',
      },
    });
  };

  const renderItem = ({ item, index }: { item: LibraryItemWithMeta; index: number }) => {
    const poster = item.poster || item.meta?.meta?.poster;
    const progress = item.progress;
    let progressPercent = 0;

    if (item.type === 'movie' && progress?.time && progress?.duration) {
      progressPercent = Math.min((progress.time / progress.duration) * 100, 100);
    } else if (item.type === 'series' && progress) {
      // For series, show progress of the last watched episode
      const entries = Object.values(progress);
      if (entries.length > 0) {
        const lastEntry = entries[entries.length - 1] as any;
        if (lastEntry?.time && lastEntry?.duration) {
          progressPercent = Math.min((lastEntry.time / lastEntry.duration) * 100, 100);
        }
      }
    }

    return (
      <TouchableOpacity
        style={[
          styles.itemContainer,
          {
            marginLeft: index === 0 ? Spacing.lg : Spacing.sm,
            marginRight: index === items.length - 1 ? Spacing.lg : 0,
          },
        ]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.posterWrapper}>
          <Image
            source={{ uri: poster || '' }}
            style={styles.poster}
            resizeMode="cover"
          />
          
          {/* Play overlay */}
          <View style={styles.playOverlay}>
            <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.9)" />
          </View>

          {/* Progress bar */}
          {progressPercent > 0 && (
            <View style={styles.progressContainer}>
              <View
                style={[styles.progressBar, { width: `${progressPercent}%` }]}
              />
            </View>
          )}
        </View>

        <Text style={styles.title} numberOfLines={1}>
          {item.meta?.meta?.name || 'Unknown Title'}
        </Text>

        {item.type === 'series' && progress && (
          <Text style={styles.episodeInfo} numberOfLines={1}>
            {getLastWatchedEpisode(progress)}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  if (!items || items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Continue Watching</Text>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.imdb_id}
        horizontal
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

function getLastWatchedEpisode(progress: any): string {
  if (!progress || typeof progress !== 'object') return '';
  
  const entries = Object.entries(progress);
  if (entries.length === 0) return '';

  // Find the most recently watched episode
  let latest: { key: string; time: number } | null = null;
  
  for (const [key, value] of entries) {
    const ep = value as any;
    if (ep?.updatedAt && (!latest || ep.updatedAt > latest.time)) {
      latest = { key, time: ep.updatedAt };
    }
  }

  if (latest) {
    const [season, episode] = latest.key.split(':');
    return `S${season} E${episode}`;
  }

  return '';
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
    marginLeft: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  itemContainer: {
    width: PosterSize.large.width,
  },
  posterWrapper: {
    position: 'relative',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.card,
  },
  poster: {
    width: PosterSize.large.width,
    height: PosterSize.large.height,
    borderRadius: BorderRadius.lg,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  title: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  episodeInfo: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
