import TvBrandMark from '@/components/tv/TvBrandMark';
import TvFocusable from '@/components/tv/TvFocusable';
import TvSourceList from '@/components/tv/TvSourceList';
import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { getStreamAddons } from '@/lib/addons/streamAddons';
import { fetchStreams, getCachedMetaData } from '@/lib/api';
import { getLibraryItem } from '@/lib/db';
import {
  getStreamPlaybackSource,
  sortStreamsForPlayback,
} from '@/lib/streams/streamPresentation';
import { useAddonsStore } from '@/lib/stores/addonsStore';
import { useLibraryStore } from '@/lib/stores/libraryStore';
import type { Addon, Episode, LibraryItem, ShowResponse, Stream } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const formatEpisode = (episode: Episode) => `S${episode.season} E${episode.episode}`;

export default function TvMetaScreen() {
  const { id, type, name, autoPlay } = useLocalSearchParams<{
    id: string;
    type?: string;
    name?: string;
    autoPlay?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { addons, selectedAddon, fetchAddons } = useAddonsStore();
  const { getItemProgress } = useLibraryStore();
  const [meta, setMeta] = useState<ShowResponse | null>(null);
  const [libraryItem, setLibraryItem] = useState<LibraryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [selectedAddonUrl, setSelectedAddonUrl] = useState<string | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const streamAddons = useMemo(() => getStreamAddons(addons || []), [addons]);
  const seasons = useMemo(() => {
    const videos = meta?.meta?.videos || [];
    return Array.from(new Set(videos.map((episode) => episode.season))).sort((a, b) => a - b);
  }, [meta]);
  const episodes = useMemo(() => {
    const videos = meta?.meta?.videos || [];
    return videos
      .filter((episode) => episode.season === selectedSeason)
      .sort((a, b) => a.episode - b.episode);
  }, [meta, selectedSeason]);

  const isSeries = meta?.meta?.type === 'series';

  useEffect(() => {
    fetchAddons().catch(() => undefined);
  }, [fetchAddons]);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        let resolvedType = type || 'movie';
        let data: ShowResponse;
        try {
          data = await getCachedMetaData(id, resolvedType);
        } catch {
          resolvedType = resolvedType === 'movie' ? 'series' : 'movie';
          data = await getCachedMetaData(id, resolvedType);
        }
        setMeta(data);
        const firstSeason = data.meta.type === 'series'
          ? Array.from(new Set((data.meta.videos || []).map((episode) => episode.season))).sort((a, b) => a - b)[0]
          : null;
        setSelectedSeason(firstSeason ?? null);
        const storeItem = getItemProgress(id);
        const remoteItem = storeItem ? null : await getLibraryItem(id);
        setLibraryItem((storeItem || remoteItem || null) as LibraryItem | null);
      } catch {
        setError('Unable to load this title.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [getItemProgress, id, type]);

  useEffect(() => {
    if (!streamAddons.length) {
      setSelectedAddonUrl(null);
      return;
    }
    const next = selectedAddon || streamAddons[0].transport_url;
    setSelectedAddonUrl((current) => current || next);
  }, [selectedAddon, streamAddons]);

  const loadStreams = useCallback(async (
    episode: Episode | null = selectedEpisode,
    addonUrl: string | null = selectedAddonUrl
  ) => {
    if (!id || !meta?.meta || !addonUrl) {
      setStreamError('Install a streaming addon first.');
      return;
    }

    setLoadingStreams(true);
    setStreamError(null);
    try {
      const list = meta.meta.type === 'series'
        ? await fetchStreams(addonUrl, 'series', id, episode?.season, episode?.episode)
        : await fetchStreams(addonUrl, 'movie', id);
      setStreams(sortStreamsForPlayback(list));
      if (list.length === 0) setStreamError('No sources found from this addon.');
    } catch {
      setStreams([]);
      setStreamError('Unable to load sources from this addon.');
    } finally {
      setLoadingStreams(false);
    }
  }, [id, meta, selectedAddonUrl, selectedEpisode]);

  useEffect(() => {
    if (!meta?.meta || autoPlay !== 'true' || meta.meta.type === 'series') return;
    loadStreams(null);
  }, [autoPlay, loadStreams, meta]);

  const resolveResumeTime = useCallback((episode: Episode | null) => {
    const progress = libraryItem?.progress;
    if (!progress) return 0;
    if (!episode) {
      const time = Number(progress?.time);
      return Number.isFinite(time) && time > 0 ? Math.floor(time) : 0;
    }
    const key = `${episode.season}:${episode.episode}`;
    const time = Number(progress?.[key]?.time);
    return Number.isFinite(time) && time > 0 ? Math.floor(time) : 0;
  }, [libraryItem]);

  const playStream = useCallback((stream: Stream) => {
    if (!id || !meta?.meta) return;
    const videoSrc = getStreamPlaybackSource(stream);
    if (!videoSrc) {
      setStreamError('This source is missing a playable URL.');
      return;
    }

    router.push({
      pathname: '/player',
      params: {
        videoSrc,
        title: meta.meta.name,
        imdbId: id,
        type: meta.meta.type,
        poster: meta.meta.poster || '',
        season: selectedEpisode?.season?.toString() || '',
        episode: selectedEpisode?.episode?.toString() || '',
        fileIdx: stream.fileIdx?.toString() || '',
        startTime: String(resolveResumeTime(selectedEpisode)),
      },
    });
  }, [id, meta, resolveResumeTime, selectedEpisode]);

  const selectEpisode = useCallback((episode: Episode) => {
    setSelectedEpisode(episode);
    setStreams([]);
    loadStreams(episode);
  }, [loadStreams]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.text} />
      </View>
    );
  }

  if (error || !meta?.meta) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>{error || 'Title not found'}</Text>
        <TvFocusable style={styles.backButton} focusedStyle={styles.buttonFocused} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Back</Text>
        </TvFocusable>
      </View>
    );
  }

  const heroHeight = Math.max(380, Math.round(height * 0.58));
  const heroImage = meta.meta.background || meta.meta.poster || '';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { height: heroHeight }]}>
          {heroImage ? (
            <Image
              source={{ uri: heroImage }}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={heroImage}
              style={styles.heroImage}
            />
          ) : null}
          <LinearGradient
            colors={['rgba(9,9,9,0.2)', 'rgba(9,9,9,0.72)', Colors.background]}
            locations={[0, 0.58, 1]}
            style={[styles.heroGradient, { paddingTop: Math.max(Spacing.xl, insets.top + Spacing.md) }]}
          >
            <View style={styles.header}>
              <TvFocusable style={styles.iconButton} focusedStyle={styles.iconButtonFocused} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={28} color={Colors.text} />
              </TvFocusable>
              <TvBrandMark size={42} />
            </View>

            <View style={[styles.heroContent, { maxWidth: Math.min(780, width * 0.62) }]}>
              <View style={styles.titleRow}>
                {meta.meta.poster ? (
                  <Image
                    source={{ uri: meta.meta.poster }}
                    style={styles.poster}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={meta.meta.poster}
                  />
                ) : null}
                <View style={styles.titleText}>
                  <Text style={styles.title} numberOfLines={2}>{meta.meta.name || name}</Text>
                  <Text style={styles.metaLine} numberOfLines={1}>
                    {[meta.meta.year, meta.meta.runtime, meta.meta.imdbRating].filter(Boolean).join('  ')}
                  </Text>
                </View>
              </View>
              {meta.meta.description ? (
                <Text style={styles.description} numberOfLines={3}>{meta.meta.description}</Text>
              ) : null}
              <View style={styles.actions}>
                <TvFocusable
                  hasTVPreferredFocus
                  style={styles.primaryButton}
                  focusedStyle={styles.primaryButtonFocused}
                  onPress={() => isSeries ? episodes[0] && selectEpisode(episodes[0]) : loadStreams(null)}
                >
                  <Ionicons name="play" size={24} color="#000" />
                  <Text style={styles.primaryText}>{isSeries ? 'Choose Episode' : 'Find Sources'}</Text>
                </TvFocusable>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.content}>
          {streamAddons.length > 1 ? (
            <FlatList
              horizontal
              data={streamAddons}
              keyExtractor={(addon: Addon) => addon.transport_url}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.addonList}
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              removeClippedSubviews
              renderItem={({ item }) => {
                const active = item.transport_url === selectedAddonUrl;
                return (
                  <TvFocusable
                    style={[styles.addonButton, active ? styles.addonButtonActive : null]}
                    focusedStyle={styles.buttonFocused}
                    onPress={() => {
                      const nextAddonUrl = item.transport_url;
                      setSelectedAddonUrl(nextAddonUrl);
                      setStreams([]);
                      if (!isSeries || selectedEpisode) {
                        loadStreams(selectedEpisode, nextAddonUrl);
                      }
                    }}
                  >
                    <Text style={[styles.addonText, active ? styles.addonTextActive : null]}>
                      {item.manifest?.name || 'Addon'}
                    </Text>
                  </TvFocusable>
                );
              }}
            />
          ) : null}

          {isSeries ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Episodes</Text>
              <FlatList
                horizontal
                data={seasons}
                keyExtractor={(season) => String(season)}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.seasonList}
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                removeClippedSubviews
                renderItem={({ item }) => {
                  const active = item === selectedSeason;
                  return (
                    <TvFocusable
                      style={[styles.seasonButton, active ? styles.seasonButtonActive : null]}
                      focusedStyle={styles.buttonFocused}
                      onPress={() => {
                        setSelectedSeason(item);
                        setSelectedEpisode(null);
                        setStreams([]);
                      }}
                    >
                      <Text style={[styles.seasonText, active ? styles.seasonTextActive : null]}>
                        Season {item}
                      </Text>
                    </TvFocusable>
                  );
                }}
              />
              <FlatList
                horizontal
                data={episodes}
                keyExtractor={(episode) => episode.id || `${episode.season}-${episode.episode}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.episodeList}
                initialNumToRender={6}
                maxToRenderPerBatch={6}
                removeClippedSubviews
                windowSize={3}
                renderItem={({ item, index }) => {
                  const active = selectedEpisode?.id === item.id;
                  return (
                    <TvFocusable
                      hasTVPreferredFocus={index === 0}
                      style={[styles.episodeCard, active ? styles.episodeCardActive : null]}
                      focusedStyle={styles.episodeFocused}
                      onPress={() => selectEpisode(item)}
                    >
                      {item.thumbnail ? (
                        <Image
                          source={{ uri: item.thumbnail }}
                          style={styles.episodeImage}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          recyclingKey={item.thumbnail}
                        />
                      ) : (
                        <View style={styles.episodeImagePlaceholder}>
                          <Ionicons name="film-outline" size={34} color={Colors.textMuted} />
                        </View>
                      )}
                      <Text style={styles.episodeNumber}>{formatEpisode(item)}</Text>
                      <Text style={styles.episodeTitle} numberOfLines={2}>{item.name}</Text>
                    </TvFocusable>
                  );
                }}
              />
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sources</Text>
            {loadingStreams ? (
              <View style={styles.sourcesLoading}>
                <ActivityIndicator color={Colors.text} />
                <Text style={styles.sourcesLoadingText}>Loading sources</Text>
              </View>
            ) : streams.length > 0 ? (
              <TvSourceList streams={streams} onSelect={playStream} preferredFirstFocus />
            ) : (
              <View style={styles.emptySources}>
                <Text style={styles.emptySourcesTitle}>{streamError || 'No sources loaded'}</Text>
                <Text style={styles.emptySourcesText}>
                  {isSeries ? 'Choose an episode to fetch sources.' : 'Find sources to start watching.'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: Spacing.xl },
  hero: { width: '100%' },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroGradient: { flex: 1, paddingHorizontal: Spacing.xxxl, paddingBottom: Spacing.xxxl, justifyContent: 'space-between' },
  scrollContent: { paddingBottom: Spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.glass, alignItems: 'center', justifyContent: 'center' },
  iconButtonFocused: { backgroundColor: Colors.glassStrong, transform: [{ scale: 1.08 }] },
  heroContent: { gap: Spacing.lg },
  titleRow: { flexDirection: 'row', gap: Spacing.lg, alignItems: 'flex-end' },
  poster: { width: 104, height: 156, borderRadius: BorderRadius.md },
  titleText: { flex: 1, gap: Spacing.sm },
  title: { color: Colors.text, fontSize: 50, fontWeight: Typography.weights.bold, lineHeight: 56 },
  metaLine: { color: Colors.textSecondary, fontSize: Typography.sizes.lg },
  description: { color: Colors.textSecondary, fontSize: Typography.sizes.lg, lineHeight: 26 },
  actions: { flexDirection: 'row', gap: Spacing.md },
  primaryButton: { height: 54, paddingHorizontal: Spacing.xl, borderRadius: BorderRadius.full, backgroundColor: Colors.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  primaryButtonFocused: { transform: [{ scale: 1.06 }] },
  primaryText: { color: Colors.background, fontSize: Typography.sizes.lg, fontWeight: Typography.weights.bold },
  content: { paddingHorizontal: Spacing.xxxl, paddingBottom: Spacing.xxxl, gap: Spacing.xxxl },
  addonList: { gap: Spacing.md, paddingBottom: Spacing.sm },
  addonButton: { height: 42, paddingHorizontal: Spacing.lg, borderRadius: 21, backgroundColor: Colors.glass, alignItems: 'center', justifyContent: 'center' },
  addonButtonActive: { backgroundColor: Colors.text },
  addonText: { color: Colors.textSecondary, fontSize: Typography.sizes.md, fontWeight: Typography.weights.semibold },
  addonTextActive: { color: Colors.background },
  section: { gap: Spacing.lg },
  sectionTitle: { color: Colors.text, fontSize: Typography.sizes.xxl, fontWeight: Typography.weights.bold },
  seasonList: { gap: Spacing.md },
  seasonButton: { height: 42, paddingHorizontal: Spacing.lg, borderRadius: 21, backgroundColor: Colors.glass, justifyContent: 'center' },
  seasonButtonActive: { backgroundColor: Colors.text },
  seasonText: { color: Colors.textSecondary, fontSize: Typography.sizes.md, fontWeight: Typography.weights.semibold },
  seasonTextActive: { color: Colors.background },
  episodeList: { gap: Spacing.lg, paddingBottom: Spacing.sm },
  episodeCard: { width: 230, gap: Spacing.sm, borderRadius: BorderRadius.lg, backgroundColor: Colors.backgroundTertiary, padding: Spacing.sm },
  episodeCardActive: { backgroundColor: Colors.cardHover },
  episodeFocused: { transform: [{ scale: 1.05 }], backgroundColor: Colors.cardHover },
  episodeImage: { width: '100%', height: 128, borderRadius: BorderRadius.md },
  episodeImagePlaceholder: { width: '100%', height: 128, borderRadius: BorderRadius.md, backgroundColor: Colors.glass, alignItems: 'center', justifyContent: 'center' },
  episodeNumber: { color: Colors.textMuted, fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold },
  episodeTitle: { color: Colors.text, fontSize: Typography.sizes.md, fontWeight: Typography.weights.semibold, lineHeight: 20 },
  sourcesLoading: { height: 120, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  sourcesLoadingText: { color: Colors.textSecondary, fontSize: Typography.sizes.md },
  emptySources: { minHeight: 120, borderRadius: BorderRadius.lg, backgroundColor: Colors.backgroundTertiary, padding: Spacing.xl, justifyContent: 'center', gap: Spacing.sm },
  emptySourcesTitle: { color: Colors.text, fontSize: Typography.sizes.lg, fontWeight: Typography.weights.bold },
  emptySourcesText: { color: Colors.textSecondary, fontSize: Typography.sizes.md },
  backButton: { height: 52, paddingHorizontal: Spacing.xl, borderRadius: BorderRadius.full, backgroundColor: Colors.glass, justifyContent: 'center' },
  buttonFocused: { transform: [{ scale: 1.06 }], backgroundColor: Colors.cardHover },
  buttonText: { color: Colors.text, fontSize: Typography.sizes.lg, fontWeight: Typography.weights.semibold },
  errorTitle: { color: Colors.text, fontSize: Typography.sizes.xxl, fontWeight: Typography.weights.bold },
});
