import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { getAddonHomeSections, getPopularTitles, getNewReleases, getTitlesByGenre } from '@/lib/api';
import { useAddonsStore } from '@/lib/stores/addonsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { useLibraryStore } from '@/lib/stores/libraryStore';
import type { Addon, PopularTitleMeta } from '@/lib/types';

import ContentRow from '@/components/home/ContentRow';
import ContinueWatching from '@/components/home/ContinueWatching';
import Hero from '@/components/home/Hero';

// Content row configuration for variety
interface ContentSection {
  id: string;
  title: string;
  data: PopularTitleMeta[];
  size?: 'small' | 'medium' | 'large';
}

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { items: libraryItems, fetchLibrary } = useLibraryStore();
  const { fetchAddons } = useAddonsStore();

  const [refreshing, setRefreshing] = useState(false);
  const [addonSectionsLoading, setAddonSectionsLoading] = useState(false);
  const [featuredTitle, setFeaturedTitle] = useState<PopularTitleMeta | null>(null);
  
  const [baseSections, setBaseSections] = useState<ContentSection[]>([]);
  const [addonSections, setAddonSections] = useState<ContentSection[]>([]);
  const sections = useMemo(() => [...baseSections, ...addonSections], [baseSections, addonSections]);

  const loadBaseContent = async () => {
    try {
      const currentYear = new Date().getFullYear();
      
      // Fetch multiple content types in parallel
      const [
        popularMovies,
        popularSeries,
        newMovies,
        newSeries,
        actionMovies,
        sciFiMovies,
        thrillerMovies,
        comedySeries,
        dramaSeries,
      ] = await Promise.all([
        getPopularTitles('movie').catch(() => []),
        getPopularTitles('series').catch(() => []),
        getNewReleases('movie', currentYear).catch(() => []),
        getNewReleases('series', currentYear).catch(() => []),
        getTitlesByGenre('movie', 'Action').catch(() => []),
        getTitlesByGenre('movie', 'Sci-Fi').catch(() => []),
        getTitlesByGenre('movie', 'Thriller').catch(() => []),
        getTitlesByGenre('series', 'Comedy').catch(() => []),
        getTitlesByGenre('series', 'Drama').catch(() => []),
      ]);

      // Build content sections
      const contentSections: ContentSection[] = [];

      const newReleases = [...newMovies.slice(0, 10), ...newSeries.slice(0, 10)]
        .filter(item => item.poster)
        .sort(() => Math.random() - 0.5)
        .slice(0, 15);
      if (newReleases.length > 0) {
        contentSections.push({
          id: 'new-releases',
          title: `New in ${currentYear}`,
          data: newReleases,
          size: 'medium',
        });
      }

      if (popularMovies.length > 0) {
        contentSections.push({
          id: 'popular-movies',
          title: 'Popular Movies',
          data: popularMovies.slice(0, 20),
          size: 'medium',
        });
      }

      if (popularSeries.length > 0) {
        contentSections.push({
          id: 'popular-series',
          title: 'Popular TV Shows',
          data: popularSeries.slice(0, 20),
          size: 'medium',
        });
      }

      if (actionMovies.length > 0) {
        contentSections.push({
          id: 'action-movies',
          title: 'Action Movies',
          data: actionMovies.slice(0, 20),
          size: 'medium',
        });
      }

      if (sciFiMovies.length > 0) {
        contentSections.push({
          id: 'scifi-movies',
          title: 'Sci-Fi Movies',
          data: sciFiMovies.slice(0, 20),
          size: 'medium',
        });
      }

      if (thrillerMovies.length > 0) {
        contentSections.push({
          id: 'thriller-movies',
          title: 'Thrillers',
          data: thrillerMovies.slice(0, 20),
          size: 'medium',
        });
      }

      if (comedySeries.length > 0) {
        contentSections.push({
          id: 'comedy-series',
          title: 'Comedy Shows',
          data: comedySeries.slice(0, 20),
          size: 'medium',
        });
      }

      if (dramaSeries.length > 0) {
        contentSections.push({
          id: 'drama-series',
          title: 'Drama Series',
          data: dramaSeries.slice(0, 20),
          size: 'medium',
        });
      }

      const topRated = [...popularMovies, ...popularSeries]
        .filter((item) => item.imdbRating && item.poster)
        .sort((a, b) => parseFloat(b.imdbRating || '0') - parseFloat(a.imdbRating || '0'))
        .slice(0, 20);
      if (topRated.length > 0) {
        contentSections.push({
          id: 'top-rated',
          title: 'Top Rated',
          data: topRated,
          size: 'medium',
        });
      }

      setBaseSections(contentSections);

      const heroPool = [...newMovies, ...newSeries, ...popularMovies, ...popularSeries].filter(
        (item) => item.background && item.logo && parseInt(item.year || '0') >= 2020
      );
      if (heroPool.length > 0) {
        const randomIndex = Math.floor(Math.random() * Math.min(15, heroPool.length));
        setFeaturedTitle(heroPool[randomIndex]);
      } else if (popularMovies.length > 0) {
        setFeaturedTitle(popularMovies[0]);
      }
    } catch (error) {
      console.error('Failed to load content:', error);
    }
  };

  const loadAddonSections = async (installedAddons: Addon[]) => {
    try {
      const nextAddonSections = await getAddonHomeSections(installedAddons).catch(() => []);
      setAddonSections(
        nextAddonSections.map((section) => ({
          id: `addon-${section.id}`,
          title: section.title,
          data: section.data,
          size: 'medium' as const,
        }))
      );
    } catch (error) {
      console.error('Failed to load addon sections:', error);
      setAddonSections([]);
    }
  };

  const initialize = async () => {
    setAddonSections([]);
    setAddonSectionsLoading(true);

    await Promise.all([
      loadBaseContent(),
      user ? fetchLibrary() : Promise.resolve(),
      fetchAddons()
        .then(() => loadAddonSections(useAddonsStore.getState().addons))
        .finally(() => setAddonSectionsLoading(false)),
    ]);
  };

  useEffect(() => {
    initialize();
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setAddonSectionsLoading(true);
    await Promise.all([
      loadBaseContent(),
      user ? fetchLibrary() : Promise.resolve(),
      fetchAddons()
        .then(() => loadAddonSections(useAddonsStore.getState().addons))
        .finally(() => setAddonSectionsLoading(false)),
    ]);
    setRefreshing(false);
  }, [fetchAddons, fetchLibrary, user]);

  const refreshFeatured = useCallback(() => {
    if (sections.length === 0) return;
    
    // Get all items with good hero imagery
    const allItems = sections.flatMap(s => s.data).filter(
      (item) => item.background && parseInt(item.year || '0') >= 2018
    );
    
    if (allItems.length > 0) {
      const randomIndex = Math.floor(Math.random() * allItems.length);
      setFeaturedTitle(allItems[randomIndex]);
    }
  }, [sections]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.text}
          />
        }
      >
        {/* Hero Section */}
        {featuredTitle && (
          <Hero item={featuredTitle} onRefresh={refreshFeatured} />
        )}

        {/* Continue Watching */}
        {libraryItems.length > 0 && (
          <ContinueWatching items={libraryItems} />
        )}

        {/* Dynamic Content Sections */}
        {sections.map((section) => (
          <ContentRow
            key={section.id}
            title={section.title}
            items={section.data}
            size={section.size || 'medium'}
          />
        ))}

        {addonSectionsLoading && (
          <View style={styles.addonSkeletonGroup}>
            {[0, 1, 2].map((group) => (
              <View key={`addon-skeleton-${group}`} style={styles.addonSkeletonSection}>
                <View style={styles.addonSkeletonTitle} />
                <View style={styles.addonSkeletonRow}>
                  {[0, 1, 2, 3].map((card) => (
                    <View key={`addon-skeleton-${group}-${card}`} style={styles.addonSkeletonCard} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Spacing at bottom for tab bar */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  addonSkeletonGroup: {
    gap: Spacing.lg,
    paddingTop: Spacing.md,
  },
  addonSkeletonSection: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  addonSkeletonTitle: {
    height: 18,
    width: 160,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  addonSkeletonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  addonSkeletonCard: {
    width: 120,
    height: 180,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
