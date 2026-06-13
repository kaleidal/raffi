import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import type { PopularTitleMeta } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import {
    Dimensions,
    Image,
    ImageBackground,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface HeroProps {
  item: PopularTitleMeta;
  onRefresh?: () => void;
}

export default function Hero({ item, onRefresh }: HeroProps) {
  const handlePlay = () => {
    router.push({
      pathname: '/meta/[id]',
      params: {
        id: item.imdb_id,
        type: item.type,
        name: item.name,
        autoPlay: 'true',
      },
    });
  };

  const handleInfo = () => {
    router.push({
      pathname: '/meta/[id]',
      params: {
        id: item.imdb_id,
        type: item.type,
        name: item.name,
      },
    });
  };

  return (
    <View style={styles.container}>
      <ImageBackground
        source={{ uri: item.background || item.poster || '' }}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['transparent', 'rgba(9,9,9,0.6)', Colors.background]}
          locations={[0, 0.6, 1]}
          style={styles.gradient}
        >
          <View style={styles.content}>
            {/* Logo or Title */}
            {item.logo ? (
              <Image
                source={{ uri: item.logo }}
                style={styles.logo}
                resizeMode="contain"
              />
            ) : (
              <Text style={styles.title} numberOfLines={2}>
                {item.name}
              </Text>
            )}

            {/* Meta info */}
            <View style={styles.metaRow}>
              {item.year && <Text style={styles.metaText}>{item.year}</Text>}
              {item.imdbRating && (
                <>
                  <View style={styles.dot} />
                  <Ionicons name="star" size={14} color={Colors.warning} />
                  <Text style={styles.metaText}>{item.imdbRating}</Text>
                </>
              )}
              {item.runtime && (
                <>
                  <View style={styles.dot} />
                  <Text style={styles.metaText}>{item.runtime}</Text>
                </>
              )}
            </View>

            {/* Genres */}
            {item.genre && item.genre.length > 0 && (
              <Text style={styles.genres} numberOfLines={1}>
                {item.genre.slice(0, 3).join(' • ')}
              </Text>
            )}

            {/* Action Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.playButton}
                onPress={handlePlay}
                activeOpacity={0.8}
              >
                <Ionicons name="play" size={22} color="#000" />
                <Text style={styles.playButtonText}>Play</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.infoButton}
                onPress={handleInfo}
                activeOpacity={0.8}
              >
                <Ionicons name="information-circle-outline" size={22} color="#FFF" />
                <Text style={styles.infoButtonText}>Info</Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </ImageBackground>

      {/* Refresh Button */}
      {onRefresh && (
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.6,
    position: 'relative',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  gradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  content: {
    gap: Spacing.sm,
  },
  logo: {
    width: SCREEN_WIDTH * 0.6,
    height: 80,
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: Typography.sizes.hero,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metaText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  genres: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.full,
  },
  playButtonText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: '#000',
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
  },
  infoButtonText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  refreshButton: {
    position: 'absolute',
    top: 60,
    right: Spacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: Spacing.md,
    borderRadius: BorderRadius.full,
  },
});
