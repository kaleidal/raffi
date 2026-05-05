import TvContentRow, { type TvTitleItem } from '@/components/tv/TvContentRow';
import TvBrandMark from '@/components/tv/TvBrandMark';
import TvFocusable from '@/components/tv/TvFocusable';
import TvHero from '@/components/tv/TvHero';
import { Colors, Spacing, Typography } from '@/constants/theme';
import {
  getAddonHomeSections,
  getNewReleases,
  getPopularTitles,
  getTitlesByGenre,
} from '@/lib/api';
import { useAddonsStore } from '@/lib/stores/addonsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { useLibraryStore } from '@/lib/stores/libraryStore';
import type { Addon, PopularTitleMeta } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ROW_ITEM_LIMIT = 16;

interface ContentSection {
  id: string;
  title: string;
  data: TvTitleItem[];
}

const toTvItem = (item: PopularTitleMeta): TvTitleItem => ({
  id: item.id || item.imdb_id,
  imdb_id: item.imdb_id,
  name: item.name,
  type: item.type,
  poster: item.poster,
  background: item.background,
  year: item.year,
  imdbRating: item.imdbRating,
});

export default function TvScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { items: libraryItems, fetchLibrary } = useLibraryStore();
  const { fetchAddons } = useAddonsStore();
  const [featured, setFeatured] = useState<TvTitleItem | null>(null);
  const [sections, setSections] = useState<ContentSection[]>([]);
  const [loading, setLoading] = useState(true);

  const continueWatching = useMemo(() => {
    return libraryItems
      .map((item) => ({
        id: item.imdb_id,
        imdb_id: item.imdb_id,
        name: item.meta?.meta?.name || item.imdb_id,
        type: item.type || item.meta?.meta?.type || 'movie',
        poster: item.poster || item.meta?.meta?.poster,
        background: item.meta?.meta?.background,
        year: item.meta?.meta?.year,
        imdbRating: item.meta?.meta?.imdbRating,
      }))
      .filter((item) => item.poster || item.background);
  }, [libraryItems]);

  const openItem = useCallback((item: TvTitleItem, autoPlay = false) => {
    router.push({
      pathname: '/tv-meta/[id]' as any,
      params: {
        id: item.imdb_id,
        type: item.type || 'movie',
        name: item.name,
        autoPlay: autoPlay ? 'true' : 'false',
      },
    });
  }, []);

  const loadAddonSections = useCallback(async (installedAddons: Addon[]) => {
    const addonSections = await getAddonHomeSections(installedAddons).catch(() => []);
    return addonSections
      .map((section) => ({
        id: `addon-${section.id}`,
        title: section.title,
        data: section.data.slice(0, ROW_ITEM_LIMIT).map(toTvItem),
      }))
      .filter((section) => section.data.length > 0);
  }, []);

  const load = useCallback(async () => {
    const year = new Date().getFullYear();
    const [
      popularMovies,
      popularSeries,
      newMovies,
      newSeries,
      actionMovies,
      sciFiMovies,
    ] = await Promise.all([
      getPopularTitles('movie').catch(() => []),
      getPopularTitles('series').catch(() => []),
      getNewReleases('movie', year).catch(() => []),
      getNewReleases('series', year).catch(() => []),
      getTitlesByGenre('movie', 'Action').catch(() => []),
      getTitlesByGenre('movie', 'Sci-Fi').catch(() => []),
      user ? fetchLibrary().catch(() => undefined) : Promise.resolve(undefined),
      fetchAddons().catch(() => undefined),
    ]);

    const baseSections: ContentSection[] = [
      {
        id: 'new',
        title: `New in ${year}`,
        data: [...newMovies, ...newSeries].filter((item) => item.poster).slice(0, ROW_ITEM_LIMIT).map(toTvItem),
      },
      {
        id: 'movies',
        title: 'Popular Movies',
        data: popularMovies.slice(0, ROW_ITEM_LIMIT).map(toTvItem),
      },
      {
        id: 'series',
        title: 'Popular Shows',
        data: popularSeries.slice(0, ROW_ITEM_LIMIT).map(toTvItem),
      },
      {
        id: 'action',
        title: 'Action',
        data: actionMovies.slice(0, ROW_ITEM_LIMIT).map(toTvItem),
      },
      {
        id: 'scifi',
        title: 'Sci-Fi',
        data: sciFiMovies.slice(0, ROW_ITEM_LIMIT).map(toTvItem),
      },
    ].filter((section) => section.data.length > 0);

    const addonRows = await loadAddonSections(useAddonsStore.getState().addons);
    const heroPool = [...newMovies, ...newSeries, ...popularMovies, ...popularSeries]
      .filter((item) => item.background || item.poster);

    setFeatured(heroPool[0] ? toTvItem(heroPool[0]) : null);
    setSections([...baseSections, ...addonRows]);
  }, [fetchAddons, fetchLibrary, loadAddonSections, user]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.topBar, { paddingTop: Math.max(Spacing.xl, insets.top + Spacing.md) }]}>
          <TvBrandMark size={48} />
          <View style={styles.navActions}>
            <TvFocusable
              style={styles.navButton}
              focusedStyle={styles.navButtonFocused}
              onPress={() => router.push('/tv-search' as any)}
            >
              <Ionicons name="search" size={20} color={Colors.text} />
              <Text style={styles.navButtonText}>Search</Text>
            </TvFocusable>
            <TvFocusable
              style={styles.navButton}
              focusedStyle={styles.navButtonFocused}
              onPress={() => router.push('/addons' as any)}
            >
              <Ionicons name="extension-puzzle-outline" size={20} color={Colors.text} />
              <Text style={styles.navButtonText}>Addons</Text>
            </TvFocusable>
            <TvFocusable
              style={styles.navButton}
              focusedStyle={styles.navButtonFocused}
              onPress={() => router.push('/settings' as any)}
            >
              <Ionicons name="settings-outline" size={20} color={Colors.text} />
              <Text style={styles.navButtonText}>Settings</Text>
            </TvFocusable>
          </View>
        </View>

        {featured ? (
          <TvHero
            item={featured}
            onPlay={() => openItem(featured, true)}
            onMore={() => openItem(featured)}
          />
        ) : loading ? (
          <View style={styles.loadingHero}>
            <ActivityIndicator color={Colors.text} />
          </View>
        ) : null}

        <View style={styles.rows}>
          {continueWatching.length > 0 ? (
            <TvContentRow
              title="Continue Watching"
              items={continueWatching}
              onPressItem={openItem}
            />
          ) : null}
          {sections.map((section) => (
            <TvContentRow
              key={section.id}
              title={section.title}
              items={section.data}
              onPressItem={openItem}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 5,
    paddingHorizontal: Spacing.xxxl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
  },
  navActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  navButton: {
    height: 44,
    paddingHorizontal: Spacing.lg,
    borderRadius: 22,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  navButtonFocused: {
    backgroundColor: Colors.glassStrong,
    transform: [{ scale: 1.06 }],
  },
  navButtonText: {
    color: Colors.text,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
  },
  loadingHero: {
    height: 420,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rows: {
    gap: Spacing.xxl,
    paddingBottom: Spacing.xxxl,
  },
});
