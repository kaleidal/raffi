import TvContentRow, { type TvTitleItem } from '@/components/tv/TvContentRow';
import TvFocusable from '@/components/tv/TvFocusable';
import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { getPopularTitles, searchTitles } from '@/lib/api';
import debounce from '@/lib/utils/debounce';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const toSearchItem = (item: any): TvTitleItem => ({
  id: item.id || item.imdb_id || item['#IMDB_ID'],
  imdb_id: item.imdb_id || item['#IMDB_ID'],
  name: item.name || item['#TITLE'],
  type: item.type || 'movie',
  poster: item.poster || item['#IMG_POSTER'],
  background: item.background,
  year: item.year || item['#YEAR'],
  imdbRating: item.imdbRating,
});

export default function TvSearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TvTitleItem[]>([]);
  const [suggestions, setSuggestions] = useState<TvTitleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState(false);

  useEffect(() => {
    Promise.all([
      getPopularTitles('movie').catch(() => []),
      getPopularTitles('series').catch(() => []),
    ]).then(([movies, series]) => {
      setSuggestions([...movies.slice(0, 8), ...series.slice(0, 8)].map(toSearchItem));
    });
  }, []);

  const performSearch = useMemo(
    () => debounce(async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const data = await searchTitles(trimmed).catch(() => []);
      setResults(data.map(toSearchItem).filter((item) => item.imdb_id));
      setLoading(false);
    }, 350),
    []
  );

  const openItem = useCallback((item: TvTitleItem) => {
    router.push({
      pathname: '/tv-meta/[id]' as any,
      params: {
        id: item.imdb_id,
        type: item.type || 'movie',
        name: item.name,
      },
    });
  }, []);

  const onChangeText = (value: string) => {
    setQuery(value);
    if (value.trim()) setLoading(true);
    performSearch(value);
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(Spacing.xxl, insets.top + Spacing.lg) }]}>
      <View style={styles.header}>
        <TvFocusable
          style={styles.backButton}
          focusedStyle={styles.backButtonFocused}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </TvFocusable>
        <Text style={styles.title}>Search</Text>
      </View>

      <View style={[styles.inputWrap, focusedInput ? styles.inputWrapFocused : null]}>
        <Ionicons name="search" size={24} color={Colors.textMuted} />
        <TextInput
          autoFocus
          value={query}
          onChangeText={onChangeText}
          placeholder="Search movies and shows"
          placeholderTextColor={Colors.textMuted}
          style={styles.input}
          onFocus={() => setFocusedInput(true)}
          onBlur={() => setFocusedInput(false)}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.text} />
        </View>
      ) : query.trim() ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.imdb_id}
          contentContainerStyle={styles.results}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          removeClippedSubviews
          windowSize={5}
          renderItem={({ item, index }) => (
            <TvFocusable
              hasTVPreferredFocus={index === 0}
              style={styles.result}
              focusedStyle={styles.resultFocused}
              onPress={() => openItem(item)}
            >
              <View>
                <Text style={styles.resultTitle}>{item.name}</Text>
                <Text style={styles.resultMeta}>{item.year || item.type}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Colors.textMuted} />
            </TvFocusable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No results</Text>
              <Text style={styles.emptyText}>Try a different title.</Text>
            </View>
          }
        />
      ) : (
        <View style={styles.suggestions}>
          <TvContentRow title="Suggestions" items={suggestions} onPressItem={openItem} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xxxl,
  },
  backButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.glass,
  },
  backButtonFocused: {
    backgroundColor: Colors.glassStrong,
    transform: [{ scale: 1.08 }],
  },
  title: {
    color: Colors.text,
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
  },
  inputWrap: {
    marginTop: Spacing.xl,
    marginHorizontal: Spacing.xxxl,
    height: 62,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundTertiary,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  inputWrapFocused: {
    backgroundColor: Colors.cardHover,
    transform: [{ scale: 1.01 }],
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.sizes.xl,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  results: {
    padding: Spacing.xxxl,
    gap: Spacing.md,
  },
  result: {
    minHeight: 72,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.backgroundTertiary,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultFocused: {
    backgroundColor: Colors.cardHover,
    transform: [{ scale: 1.02 }],
  },
  resultTitle: {
    color: Colors.text,
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.semibold,
  },
  resultMeta: {
    color: Colors.textMuted,
    fontSize: Typography.sizes.md,
    marginTop: 4,
  },
  suggestions: {
    paddingTop: Spacing.xxxl,
  },
  empty: {
    paddingTop: Spacing.xxxl,
    alignItems: 'center',
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.md,
    marginTop: Spacing.sm,
  },
});
