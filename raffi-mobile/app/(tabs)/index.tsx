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
import { getPopularTitles } from '@/lib/api';
import { useAddonsStore } from '@/lib/stores/addonsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { useLibraryStore } from '@/lib/stores/libraryStore';
import type { PopularTitleMeta } from '@/lib/types';

import LoadingSpinner from '@/components/common/LoadingSpinner';
import ContentRow from '@/components/home/ContentRow';
import ContinueWatching from '@/components/home/ContinueWatching';
import Hero from '@/components/home/Hero';

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { items: libraryItems, fetchLibrary, loading: libraryLoading } = useLibraryStore();
  const { fetchAddons } = useAddonsStore();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [featuredTitle, setFeaturedTitle] = useState<PopularTitleMeta | null>(null);
  const [popularMovies, setPopularMovies] = useState<PopularTitleMeta[]>([]);
  const [popularSeries, setPopularSeries] = useState<PopularTitleMeta[]>([]);
  const [topRated, setTopRated] = useState<PopularTitleMeta[]>([]);

  const loadContent = async () => {
    try {
      const [movies, series] = await Promise.all([
        getPopularTitles('movie'),
        getPopularTitles('series'),
      ]);

      setPopularMovies(movies.slice(0, 20));
      setPopularSeries(series.slice(0, 20));

      // Combine and sort by rating for top rated
      const combined = [...movies, ...series]
        .filter((item) => item.imdbRating)
        .sort((a, b) => parseFloat(b.imdbRating || '0') - parseFloat(a.imdbRating || '0'))
        .slice(0, 20);
      setTopRated(combined);

      // Pick a random featured title with good imagery
      const withBackgrounds = [...movies, ...series].filter(
        (item) => item.background && item.logo && parseInt(item.year || '0') >= 2015
      );
      if (withBackgrounds.length > 0) {
        const randomIndex = Math.floor(Math.random() * Math.min(10, withBackgrounds.length));
        setFeaturedTitle(withBackgrounds[randomIndex]);
      } else if (movies.length > 0) {
        setFeaturedTitle(movies[0]);
      }
    } catch (error) {
      console.error('Failed to load content:', error);
    }
  };

  const initialize = async () => {
    setLoading(true);
    await Promise.all([loadContent(), fetchAddons(), user ? fetchLibrary() : Promise.resolve()]);
    setLoading(false);
  };

  useEffect(() => {
    initialize();
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadContent(), user ? fetchLibrary() : Promise.resolve()]);
    setRefreshing(false);
  }, [user]);

  const refreshFeatured = useCallback(() => {
    const all = [...popularMovies, ...popularSeries].filter(
      (item) => item.background && parseInt(item.year || '0') >= 2015
    );
    if (all.length > 0) {
      const randomIndex = Math.floor(Math.random() * all.length);
      setFeaturedTitle(all[randomIndex]);
    }
  }, [popularMovies, popularSeries]);

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

        {/* Popular Movies */}
        <ContentRow title="Popular Movies" items={popularMovies} size="medium" />

        {/* Popular Series */}
        <ContentRow title="Popular TV Shows" items={popularSeries} size="medium" />

        {/* Top Rated */}
        <ContentRow title="Top Rated" items={topRated} size="medium" />

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
