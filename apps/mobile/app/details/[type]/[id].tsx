import { fetchMeta, fetchStreams, rankStreams, type EpisodeMeta, type MediaMeta, type RankedStream } from '@raffi/shared';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { GlassSurface } from '@/components/GlassSurface';
import { useApp } from '@/state/AppContext';

function SourceRow({ source, meta, episode }: { source: RankedStream; meta: MediaMeta; episode?: EpisodeMeta }) {
  const play = () => {
    const streamSource = source.stream.url || (source.stream.infoHash ? `magnet:?xt=urn:btih:${source.stream.infoHash}` : '');
    router.push({ pathname: '/player', params: { src: streamSource, desktop: source.requiresDesktop ? '1' : '0', fileIndex: String(source.stream.fileIdx ?? ''), imdbId: meta.imdbId, type: meta.type, title: episode ? `${meta.name} · ${episode.title}` : meta.name, poster: meta.poster || '', season: String(episode?.season ?? ''), episode: String(episode?.episode ?? '') } });
  };
  return <Pressable onPress={play} className="mb-3 flex-row items-center rounded-2xl bg-panel p-4 tv:p-5"><View className="flex-1"><Text numberOfLines={1} className="text-base font-semibold text-ink tv:text-xl">{source.provider}</Text><View className="mt-2 flex-row flex-wrap gap-2">{source.badges.map((badge) => <Text key={badge} className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white/80">{badge}</Text>)}{source.requiresDesktop && <Text className="rounded-md bg-blue-400/20 px-2 py-1 text-xs font-semibold text-blue-200">Desktop</Text>}</View></View><Ionicons name="play-circle" size={34} color="white" /></Pressable>;
}

export default function Details() {
  const params = useLocalSearchParams<{ type: 'movie' | 'series'; id: string }>();
  const { addons, lists, addToList } = useApp();
  const [meta, setMeta] = React.useState<MediaMeta | null>(null);
  const [episode, setEpisode] = React.useState<EpisodeMeta | undefined>();
  const [sources, setSources] = React.useState<RankedStream[]>([]);
  const [loadingSources, setLoadingSources] = React.useState(false);
  const [listOpen, setListOpen] = React.useState(false);
  React.useEffect(() => { void fetchMeta(params.type, params.id).then((value) => { setMeta(value); setEpisode(value.videos?.[0]); }); }, [params.id, params.type]);
  const loadSources = async () => { if (!meta) return; setLoadingSources(true); const streamId = episode?.id || meta.imdbId; try { setSources(rankStreams(await fetchStreams(addons, meta.type, streamId))); } finally { setLoadingSources(false); } };
  if (!meta) return <View className="flex-1 items-center justify-center bg-canvas"><ActivityIndicator color="white" /></View>;
  return <View className="flex-1 bg-canvas"><ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
    <View className="h-[460px] tv:h-[620px]"><Image source={meta.background || meta.poster} contentFit="cover" className="absolute inset-0 h-full w-full" /><LinearGradient colors={['rgba(8,9,11,0.08)', '#08090b']} className="absolute inset-0" /><Pressable onPress={() => router.back()} className="absolute left-5 top-14 h-12 w-12 items-center justify-center rounded-full bg-black/45 tv:left-12"><Ionicons name="chevron-back" size={27} color="white" /></Pressable>
      <View className="absolute inset-x-0 bottom-0 px-6 tv:px-16"><Text className="max-w-4xl text-5xl font-black tracking-tight text-white tv:text-7xl">{meta.name}</Text><Text className="mt-3 text-base text-white/70">{[meta.year, meta.rating && `★ ${meta.rating}`, meta.runtime].filter(Boolean).join('  ·  ')}</Text></View></View>
    <View className="px-6 pt-7 tv:max-w-6xl tv:px-16"><Text className="max-w-4xl text-base leading-7 text-muted tv:text-xl tv:leading-8">{meta.description}</Text><View className="mt-7 flex-row gap-3"><Pressable onPress={() => void loadSources()} className="flex-row items-center gap-2 rounded-full bg-white px-6 py-4"><Ionicons name="play" size={20} color="black" /><Text className="font-bold text-black">Choose a source</Text></Pressable><Pressable onPress={() => setListOpen(true)} className="rounded-full border border-white/20 px-6 py-4"><Text className="font-semibold text-white">＋ My list</Text></Pressable></View>
      {meta.type === 'series' && <View className="mt-10"><Text className="mb-4 text-2xl font-bold text-ink">Episodes</Text><FlatList horizontal data={meta.videos ?? []} keyExtractor={(item) => item.id} renderItem={({ item }) => <Pressable onPress={() => { setEpisode(item); setSources([]); }} className={`${episode?.id === item.id ? 'border-white bg-white/15' : 'border-white/10 bg-panel'} mr-3 w-52 rounded-2xl border p-4`}><Text className="text-xs text-muted">S{item.season} E{item.episode}</Text><Text numberOfLines={2} className="mt-2 font-semibold text-ink">{item.title}</Text></Pressable>} /></View>}
      {loadingSources && <ActivityIndicator className="mt-10" color="white" />}{sources.length > 0 && <View className="mt-10"><Text className="mb-4 text-2xl font-bold text-ink">Sources</Text>{sources.map((source) => <SourceRow key={source.id} source={source} meta={meta} episode={episode} />)}</View>}
      {!loadingSources && sources.length === 0 && addons.length === 0 && <Text className="mt-8 rounded-2xl bg-panel p-5 text-muted">Add a source addon in Settings before choosing playback.</Text>}
    </View></ScrollView>
    <Modal transparent visible={listOpen} onRequestClose={() => setListOpen(false)} animationType="fade"><Pressable onPress={() => setListOpen(false)} className="flex-1 justify-end bg-black/60 p-4"><GlassSurface style={{ borderRadius: 28 }} className="p-6"><Text className="mb-4 text-2xl font-bold text-ink">Save to a list</Text>{lists.map((list) => <Pressable key={list.id} onPress={() => { void addToList(list.id, meta); setListOpen(false); }} className="rounded-2xl px-3 py-4"><Text className="text-lg text-ink">{list.name}</Text></Pressable>)}{lists.length === 0 && <Text className="text-muted">Create a list from Library first.</Text>}</GlassSurface></Pressable></Modal>
  </View>;
}
