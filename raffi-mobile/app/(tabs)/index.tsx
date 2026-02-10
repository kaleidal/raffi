import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing, Typography } from '@/constants/theme';
import { getAddonHomeSections, getPopularTitles, getNewReleases, getTitlesByGenre } from '@/lib/api';
import { useAddonsStore } from '@/lib/stores/addonsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { useLibraryStore } from '@/lib/stores/libraryStore';
import type { Addon, PopularTitleMeta } from '@/lib/types';

import LoadingSpinner from '@/components/common/LoadingSpinner';
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
  const { addons, fetchAddons } = useAddonsStore();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [featuredTitle, setFeaturedTitle] = useState<PopularTitleMeta | null>(null);
  
  // Content sections
  const [sections, setSections] = useState<ContentSection[]>([]);

  const loadContent = async (installedAddons: Addon[] = addons) => {
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

      // Continue watching will be handled separately above these rows

      // New Releases (Mix of movies and series from current year)
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

      // Popular Movies
      if (popularMovies.length > 0) {
        contentSections.push({
          id: 'popular-movies',
          title: 'Popular Movies',
          data: popularMovies.slice(0, 20),
          size: 'medium',
        });
      }

      // Popular TV Shows
      if (popularSeries.length > 0) {
        contentSections.push({
          id: 'popular-series',
          title: 'Popular TV Shows',
          data: popularSeries.slice(0, 20),
          size: 'medium',
        });
      }

      // Action Movies
      if (actionMovies.length > 0) {
        contentSections.push({
          id: 'action-movies',
          title: 'Action Movies',
          data: actionMovies.slice(0, 20),
          size: 'medium',
        });
      }

      // Sci-Fi Movies
      if (sciFiMovies.length > 0) {
        contentSections.push({
          id: 'scifi-movies',
          title: 'Sci-Fi Movies',
          data: sciFiMovies.slice(0, 20),
          size: 'medium',
        });
      }

      // Thriller Movies
      if (thrillerMovies.length > 0) {
        contentSections.push({
          id: 'thriller-movies',
          title: 'Thrillers',
          data: thrillerMovies.slice(0, 20),
          size: 'medium',
        });
      }

      // Comedy Series
      if (comedySeries.length > 0) {
        contentSections.push({
          id: 'comedy-series',
          title: 'Comedy Shows',
          data: comedySeries.slice(0, 20),
          size: 'medium',
        });
      }

      // Drama Series
      if (dramaSeries.length > 0) {
        contentSections.push({
          id: 'drama-series',
          title: 'Drama Series',
          data: dramaSeries.slice(0, 20),
          size: 'medium',
        });
      }

      // Addon-driven catalogs (Stremio-style home rows from addon manifests)
      const addonSections = await getAddonHomeSections(installedAddons).catch(() => []);
      for (const section of addonSections) {
        contentSections.push({
          id: `addon-${section.id}`,
          title: section.title,
          data: section.data,
          size: 'medium',
        });
      }

      // Top Rated (Mix sorted by rating)
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

      setSections(contentSections);

      // Pick a featured title for hero (recent with good imagery)
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

  const initialize = async () => {
    setLoading(true);
    await fetchAddons();
    const installedAddons = useAddonsStore.getState().addons;
    await Promise.all([
      loadContent(installedAddons),
      user ? fetchLibrary() : Promise.resolve(),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    initialize();
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const installedAddons = useAddonsStore.getState().addons;
    await Promise.all([loadContent(installedAddons), user ? fetchLibrary() : Promise.resolve()]);
    setRefreshing(false);
  }, [user, addons]);

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

  if (loading) {
    return <LoadingSpinner fullScreen message="Loading..." />;
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loginPrompt}>
          <Ionicons name="film-outline" size={80} color={Colors.primary} />
          <Text style={styles.logoText}>Raffi</Text>
          <Text style={styles.loginMessage}>Sign in to start watching</Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.loginButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
  loginPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  logoText: {
    fontSize: 56,
    fontWeight: '800',
    color: Colors.primary,
    marginTop: Spacing.lg,
    letterSpacing: -1,
  },
  loginMessage: {
    fontSize: Typography.sizes.lg,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xxl,
  },
  loginButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: 100,
  },
  loginButtonText: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.background,
  },
});
