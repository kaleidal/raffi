import { fetchHomeSections, pickFeatured, type CatalogSection, type MediaMeta } from '@raffi/shared';
import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { ContentRow } from '@/components/ContentRow';
import { DynamicDock } from '@/components/DynamicDock';
import { Hero } from '@/components/Hero';
import { PosterCard } from '@/components/PosterCard';
import { isTV } from '@/lib/platform';
import { useApp } from '@/state/AppContext';

export default function Home() {
  const { addons, progress } = useApp();
  const [sections, setSections] = React.useState<CatalogSection[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const load = React.useCallback(async () => { try { setSections(await fetchHomeSections(addons)); } finally { setLoading(false); setRefreshing(false); } }, [addons]);
  React.useEffect(() => { void load(); }, [load]);
  const allItems = React.useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const featured = pickFeatured(allItems);
  const continueItems = React.useMemo<MediaMeta[]>(() => progress.filter((item) => item.poster && item.positionSeconds > 0 && item.durationSeconds > item.positionSeconds).slice(0, 12).map((item) => ({ id: item.imdbId, imdbId: item.imdbId, type: item.type, name: 'Continue watching', poster: item.poster })), [progress]);
  return <AppShell><View className="flex-1 bg-canvas">
    {loading ? <View className="flex-1 items-center justify-center"><ActivityIndicator color="white" size="large" /></View>
      : <FlatList data={sections} keyExtractor={(item) => item.id} renderItem={({ item }) => <ContentRow title={item.title} items={item.items} />}
        ListHeaderComponent={<>{featured && <Hero item={featured} />}{continueItems.length > 0 && <View className="mb-8"><Text className="mb-4 px-6 text-2xl font-semibold text-ink">Jump back into it</Text><FlatList horizontal data={continueItems} keyExtractor={(item) => item.id} renderItem={({ item }) => <PosterCard item={item} />} contentContainerStyle={{ paddingHorizontal: 24 }} /></View>}</>}
        ListEmptyComponent={<View className="items-center px-8 py-24"><Text className="text-center text-xl text-muted">Couldn’t load discovery right now. Pull to try again.</Text></View>}
        contentContainerStyle={{ paddingTop: isTV ? 48 : 62, paddingBottom: isTV ? 80 : 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor="white" />} showsVerticalScrollIndicator={false} />}
    {!isTV && <DynamicDock mode="home" query={query} onQueryChange={setQuery} />}
  </View></AppShell>;
}
