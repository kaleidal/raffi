import { searchMedia, type MediaMeta } from '@raffi/shared';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { DynamicDock } from '@/components/DynamicDock';
import { PosterCard } from '@/components/PosterCard';
import { isTV } from '@/lib/platform';

export default function Search() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = React.useState(params.q || '');
  const [results, setResults] = React.useState<MediaMeta[]>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => { const timer = setTimeout(() => { if (!query.trim()) { setResults([]); return; } setLoading(true); void searchMedia(query).then(setResults).finally(() => setLoading(false)); }, 350); return () => clearTimeout(timer); }, [query]);
  return <AppShell><View className="flex-1 bg-canvas px-6 pt-16 tv:px-14 tv:pt-14">
    {isTV && <Text className="mb-8 text-5xl font-bold text-ink">Search</Text>}
    {isTV && <View className="mb-10 rounded-2xl bg-soft px-6 py-5"><Text className="text-xl text-muted">Use the TV keyboard to search from the rail, or pair a phone for faster entry.</Text></View>}
    {loading ? <ActivityIndicator color="white" /> : <FlatList data={results} numColumns={isTV ? 6 : 3} key={isTV ? 'tv' : 'phone'} keyExtractor={(item) => item.id} renderItem={({ item }) => <PosterCard item={item} />}
      ListEmptyComponent={<Text className="mt-28 text-center text-lg text-muted">{query ? 'No results yet' : 'Search for a movie or series'}</Text>} contentContainerStyle={{ paddingBottom: 120 }} columnWrapperStyle={{ marginBottom: 20 }} />}
    {!isTV && <DynamicDock mode="search" query={query} onQueryChange={setQuery} />}
  </View></AppShell>;
}
