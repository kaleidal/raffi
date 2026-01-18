import { BorderRadius, Colors, PosterSize, Spacing, Typography } from '@/constants/theme';
import type { PopularTitleMeta } from '@/lib/types';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import {
    Dimensions,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ContentRowProps {
  title: string;
  items: PopularTitleMeta[];
  size?: 'small' | 'medium' | 'large';
  showProgress?: boolean;
}

export default function ContentRow({
  title,
  items,
  size = 'medium',
  showProgress = false,
}: ContentRowProps) {
  const posterDimensions = PosterSize[size];

  const handlePress = (item: PopularTitleMeta) => {
    router.push({
      pathname: '/meta/[id]',
      params: {
        id: item.imdb_id,
        type: item.type,
        name: item.name,
      },
    });
  };

  const renderItem = ({ item, index }: { item: PopularTitleMeta; index: number }) => (
    <TouchableOpacity
      style={[
        styles.posterContainer,
        {
          width: posterDimensions.width,
          marginLeft: index === 0 ? Spacing.lg : Spacing.sm,
          marginRight: index === items.length - 1 ? Spacing.lg : 0,
        },
      ]}
      onPress={() => handlePress(item)}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.poster || '' }}
        style={[
          styles.poster,
          {
            width: posterDimensions.width,
            height: posterDimensions.height,
          },
        ]}
        resizeMode="cover"
      />
      {showProgress && (item as any).progress && (
        <View style={styles.progressContainer}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${Math.min(
                  ((item as any).progress?.time || 0) /
                    ((item as any).progress?.duration || 1) *
                    100,
                  100
                )}%`,
              },
            ]}
          />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.posterGradient}
      >
        <Text style={styles.posterTitle} numberOfLines={2}>
          {item.name}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  if (!items || items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.imdb_id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
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
  listContent: {
    paddingRight: Spacing.lg,
  },
  posterContainer: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.card,
  },
  poster: {
    borderRadius: BorderRadius.lg,
  },
  posterGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    paddingTop: Spacing.xxl,
  },
  posterTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
});
