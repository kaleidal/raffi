import debounce from '@/lib/utils/debounce';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import PosterCard from '@/components/common/PosterCard';
import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { getPopularTitles, searchTitles } from '@/lib/api';
import type { PopularTitleMeta } from '@/lib/types';

export default function SearchScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<PopularTitleMeta[]>([]);

  const gridGap = Spacing.sm;
  const gridInnerWidth = screenWidth - Spacing.lg * 2;
  const posterWidth = Math.floor((gridInnerWidth - gridGap * 2) / 3);
  const posterHeight = Math.round(posterWidth * 1.5);

  useEffect(() => {
    // Load some suggestions when search is empty
    const loadSuggestions = async () => {
      try {
        const [movies, series] = await Promise.all([
          getPopularTitles('movie'),
          getPopularTitles('series'),
        ]);
        const combined = [...movies.slice(0, 10), ...series.slice(0, 10)];
        setSuggestions(combined.sort(() => Math.random() - 0.5));
      } catch (e) {
        console.error(e);
      }
    };
    loadSuggestions();
  }, []);

  const performSearch = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await searchTitles(searchQuery);
        setResults(data);
      } catch (e) {
        console.error(e);
        setResults([]);
      }
      setLoading(false);
    }, 500),
    []
  );

  const handleChangeText = (text: string) => {
    setQuery(text);
    if (text.trim()) {
      setLoading(true);
    }
    performSearch(text);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    Keyboard.dismiss();
  };

  const handleResultPress = (item: any) => {
    const type = item['#IMDB_ID']?.startsWith('tt') ? 'movie' : 'movie';
    router.push({
      pathname: '/meta/[id]',
      params: {
        id: item['#IMDB_ID'],
        type: type,
        name: item['#TITLE'],
      },
    });
  };

  const renderResult = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => handleResultPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.resultContent}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {item['#TITLE']}
        </Text>
        <Text style={styles.resultYear}>{item['#YEAR']}</Text>
        {item['#RANK'] && (
          <Text style={styles.resultRank}>#{item['#RANK']}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
    </TouchableOpacity>
  );

  const renderSuggestion = ({ item }: { item: PopularTitleMeta }) => (
    <View style={[styles.suggestionItem, { width: posterWidth }]}>
      <PosterCard
        item={item}
        showRating
        showTitle
        size="small"
        dimensionsOverride={{ width: posterWidth, height: posterHeight }}
        containerStyle={{ marginRight: 0 }}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Search Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.inputWrapper}>
          <Ionicons name="search" size={20} color={Colors.textMuted} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={handleChangeText}
            placeholder="Search movies & TV shows..."
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear}>
              <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results or Suggestions */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : query.trim() && results.length > 0 ? (
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={(item) => item['#IMDB_ID'] || item['#TITLE']}
          contentContainerStyle={styles.resultsList}
          showsVerticalScrollIndicator={false}
        />
      ) : query.trim() && results.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={60} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No results found</Text>
          <Text style={styles.emptySubtext}>Try searching for something else</Text>
        </View>
      ) : (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>Suggestions</Text>
          <FlatList
            data={suggestions}
            renderItem={renderSuggestion}
            keyExtractor={(item) => item.imdb_id}
            numColumns={3}
            columnWrapperStyle={styles.suggestionRow}
            contentContainerStyle={styles.suggestionsGrid}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  headerTitle: {
    fontSize: Typography.sizes.hero,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: Typography.sizes.md,
    color: Colors.text,
    paddingVertical: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultsList: {
    paddingHorizontal: Spacing.lg,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  resultYear: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  resultRank: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  emptyText: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
    marginTop: Spacing.lg,
  },
  emptySubtext: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  suggestionsContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  suggestionsTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  suggestionsGrid: {
    paddingBottom: 100,
  },
  suggestionRow: {
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  suggestionItem: {
    alignItems: 'flex-start',
  },
});
