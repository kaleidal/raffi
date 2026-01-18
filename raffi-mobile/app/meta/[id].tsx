import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

import LoadingSpinner from '@/components/common/LoadingSpinner';
import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { fetchStreams, getCachedMetaData } from '@/lib/api';
import { getLibraryItem } from '@/lib/db';
import { useAddonsStore } from '@/lib/stores/addonsStore';
import { useLibraryStore } from '@/lib/stores/libraryStore';
import type { Addon, Episode, LibraryItem, ShowResponse, Stream } from '@/lib/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Stream metadata parsing (from desktop app)
interface StreamBadge {
  label: string;
  variant?: 'accent' | 'muted' | 'outline';
}

interface ParsedStreamMeta {
  providerLabel: string;
  hostLabel: string | null;
  resolution: string | null;
  resolutionLabel: string | null;
  isHDR: boolean;
  featureBadges: StreamBadge[];
  statusBadges: StreamBadge[];
  peerCount: number | null;
  isP2P: boolean;
  infoLine: string | null;
}

const PROVIDER_KEYWORDS = [
  'TorrentGalaxy', 'Torrentio', 'RARBG', 'ThePirateBay', '1337x', 'Torlock',
  'YTS', 'EZTV', 'TorrentLeech', 'Zooqle', 'Nyaa', 'AniDex', 'MediaFusion',
  'Bitsearch', 'MagnetDL', 'LimeTorrents', 'TorrentSeed', 'Glotorrents',
  'Demonoid', 'ByteSearch',
];

const AVAILABILITY_MAP: Record<string, string> = {
  RD: 'Real-Debrid',
  'RD+': 'Real-Debrid+',
  AD: 'AllDebrid',
  PM: 'Premiumize',
};

function extractYouTubeId(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  // Already an ID (11 chars typical)
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  // youtu.be/<id>
  const short = v.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i);
  if (short) return short[1];
  // youtube.com/watch?v=<id>
  const watch = v.match(/[?&]v=([A-Za-z0-9_-]{11})/i);
  if (watch) return watch[1];
  // youtube.com/embed/<id>
  const embed = v.match(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/i);
  if (embed) return embed[1];
  return null;
}

function buildTrailerHtml(ytId: string): string {
  // Netflix-like: autoplay muted, loop, with our own overlay controls.
  // The WebView itself is pointer-events-none; RN overlay controls drive playback via JS.
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; height: 100%; overflow: hidden; }
      #wrap { position: relative; width: 100%; height: 100%; }
      /* scale up slightly like a hero trailer */
      #player { position: absolute; top: -15%; left: -15%; width: 130%; height: 130%; }
    </style>
  </head>
  <body>
    <div id="wrap"><div id="player"></div></div>
    <script>
      (function () {
        var tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        var player;
        function post(type, payload) {
          try {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
          } catch (_) {}
        }

        window.onYouTubeIframeAPIReady = function () {
          player = new YT.Player('player', {
            videoId: '${ytId}',
            playerVars: {
              autoplay: 1,
              mute: 1,
              controls: 0,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
              loop: 1,
              playlist: '${ytId}',
              disablekb: 1,
              iv_load_policy: 3,
              fs: 0
            },
            events: {
              onReady: function () {
                try {
                  player.mute();
                  player.playVideo();
                } catch (_) {}
                post('ready', {});
              },
              onStateChange: function (e) {
                // YT.PlayerState.PLAYING = 1, PAUSED = 2, ENDED = 0
                post('state', { state: e.data });
              },
              onError: function (e) {
                post('error', { code: e.data });
              }
            }
          });
        };

        window.__raffi = {
          play: function () { try { player && player.playVideo(); } catch (_) {} },
          pause: function () { try { player && player.pauseVideo(); } catch (_) {} },
          mute: function () { try { player && player.mute(); } catch (_) {} },
          unmute: function () { try { player && player.unMute(); } catch (_) {} }
        };
      })();
    </script>
  </body>
</html>`;
}

function detectProvider(text: string | null): string | null {
  if (!text) return null;
  for (const keyword of PROVIDER_KEYWORDS) {
    const pattern = new RegExp(keyword.replace(/\s+/g, '\\s*'), 'i');
    if (pattern.test(text)) return keyword;
  }
  const tokens = text.split(/[|•\-\s]+/).map((t) => t.trim()).filter(Boolean).reverse();
  return tokens.find((token) => {
    if (!/^[A-Za-z][A-Za-z0-9.+-]{2,}$/.test(token)) return false;
    if (/(GB|MB|TB)$/i.test(token)) return false;
    if (/\d+p$/i.test(token)) return false;
    if (/HDR|SDR|HEVC|H\.?(?:26[45])|AV1|ATMOS|DDP/i.test(token)) return false;
    return true;
  }) || null;
}

function parsePeerCount(text: string | null): number | null {
  if (!text) return null;
  const peerMatch = text.match(/(\d+)\s*(?:peers?|seeders?|seeds?)/i);
  if (peerMatch) return parseInt(peerMatch[1], 10);
  const leadingMatch = text.trim().match(/^(\d{1,4})(?=\s)/);
  if (leadingMatch) return parseInt(leadingMatch[1], 10);
  return null;
}

function formatAvailability(label: string | null): string | null {
  if (!label) return null;
  const normalized = label.replace(/[[\]]/g, '').toUpperCase();
  return AVAILABILITY_MAP[normalized] ?? normalized;
}

function parseStreamMetadata(stream: Stream): ParsedStreamMeta {
  const title = (stream as any)?.title ?? '';
  const lines = title.split('\n').map((l: string) => l.trim()).filter(Boolean);
  const detailText = lines.slice(1).join(' ') || lines.join(' ');
  const fullText = `${title} ${stream?.name ?? ''}`;

  let resolutionMatch = fullText.match(/(2160|1440|1080|720|540|480|360|240)p/i);
  let resolution: string | null = resolutionMatch ? `${resolutionMatch[1]}p` : null;
  if (!resolution && /4k/i.test(fullText)) resolution = '2160p';

  const resolutionLabel = resolution
    ? resolution === '2160p' && /4k/i.test(fullText) ? '4K' : resolution.toUpperCase()
    : null;

  const hasDolbyVision = /Dolby\s?Vision|\bDV\b/i.test(fullText);
  const hasHDR = /HDR/i.test(fullText) || hasDolbyVision;
  const codecLabel = /AV1/i.test(fullText)
    ? 'AV1'
    : /(?:x265|H\.?(?:265)|HEVC)/i.test(fullText)
      ? 'HEVC'
      : /(?:x264|H\.?(?:264))/i.test(fullText) ? 'H.264' : null;
  const audioLabel = /Atmos/i.test(fullText)
    ? 'Dolby Atmos'
    : /DDP(?:\s?5\.1)?|DD5\.1/i.test(fullText)
      ? 'DDP 5.1'
      : /DTS/i.test(fullText) ? 'DTS' : null;

  const sizeMatch = fullText.match(/(\d+(?:\.\d+)?)\s?(GB|MB)/i);
  const sizeLabel = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : null;

  const provider = detectProvider(detailText) || detectProvider(fullText) || stream?.name || 'Unknown Source';
  const hostLabel = stream?.name && stream.name !== provider ? stream.name : null;
  const availability = formatAvailability(fullText.match(/\[([A-Za-z0-9+ ]+)\]/)?.[1] ?? null);
  const isP2P = Boolean(stream?.infoHash) || Boolean(stream?.url && stream.url.startsWith('magnet:'));
  const peerCount = isP2P ? parsePeerCount(detailText) : null;

  const featureBadges: StreamBadge[] = [];
  const statusBadges: StreamBadge[] = [];
  const seen = new Set<string>();

  const addFeature = (label?: string | null, variant?: 'accent' | 'muted') => {
    if (!label) return;
    const key = label.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    featureBadges.push({ label, variant });
  };

  if (availability) statusBadges.push({ label: availability, variant: 'accent' });
  if (isP2P) statusBadges.push({ label: 'P2P', variant: 'outline' });

  addFeature(resolutionLabel);
  if (hasDolbyVision) addFeature('Dolby Vision');
  else if (hasHDR) addFeature('HDR');
  addFeature(codecLabel);
  addFeature(audioLabel);
  addFeature(sizeLabel, 'muted');

  return {
    providerLabel: provider,
    hostLabel,
    resolution,
    resolutionLabel,
    isHDR: hasHDR,
    featureBadges,
    statusBadges,
    peerCount,
    isP2P,
    infoLine: hostLabel ? `via ${hostLabel}` : null,
  };
}

// Filter addons to only show those with stream capability (like desktop)
function filterStreamAddons(addonList: Addon[]): Addon[] {
  return addonList.filter((addon) => {
    if (!addon.manifest || !addon.manifest.resources) return false;
    return (addon.manifest.resources as any[]).some(
      (resource: any) =>
        (typeof resource === 'object' && resource.name === 'stream') ||
        resource === 'stream'
    );
  });
}

export default function MetaScreen() {
  const { id, type, name, autoPlay } = useLocalSearchParams<{
    id: string;
    type: string;
    name?: string;
    autoPlay?: string;
  }>();

  const { selectedAddon, addons } = useAddonsStore();
  const { getItemProgress } = useLibraryStore();

  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<ShowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [libraryItem, setLibraryItem] = useState<LibraryItem | null>(null);
  const [resumeEpisode, setResumeEpisode] = useState<Episode | null>(null);
  const [resumeMovieSeconds, setResumeMovieSeconds] = useState<number>(0);

  // Series state
  const [seasons, setSeasons] = useState<number[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [seasonEpisodes, setSeasonEpisodes] = useState<Episode[]>([]);

  // Streams modal
  const [showStreamsModal, setShowStreamsModal] = useState(false);
  const [selectedAddonUrl, setSelectedAddonUrl] = useState<string | null>(null);
  const [streamsByAddon, setStreamsByAddon] = useState<Record<string, Stream[]>>({});
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  // Trailer (must be declared before any early returns to keep hook order stable)
  const trailerId = useMemo(() => {
    const trailers = meta?.meta?.trailers;
    if (Array.isArray(trailers)) {
      for (const trailer of trailers) {
        const id = extractYouTubeId(trailer?.source);
        if (id) return id;
      }
    }

    // Some payloads include `trailerStreams` (desktop uses this heavily).
    const trailerStreams = (meta?.meta as any)?.trailerStreams;
    if (Array.isArray(trailerStreams) && trailerStreams.length > 0) {
      const last = trailerStreams[trailerStreams.length - 1];
      const id = extractYouTubeId(last?.ytId);
      if (id) return id;
    }

    return null;
  }, [meta]);
  const [trailerFailed, setTrailerFailed] = useState(false);
  const [trailerMuted, setTrailerMuted] = useState(true);
  const [trailerPlaying, setTrailerPlaying] = useState(true);
  const trailerWebViewRef = useRef<WebView>(null);

  useEffect(() => {
    setTrailerFailed(false);
    setTrailerMuted(true);
    setTrailerPlaying(true);
  }, [trailerId]);

  const trailerHtml = useMemo(() => {
    if (!trailerId) return null;
    return buildTrailerHtml(trailerId);
  }, [trailerId]);

  const sendTrailerCommand = useCallback((command: 'play' | 'pause' | 'mute' | 'unmute') => {
    trailerWebViewRef.current?.injectJavaScript(
      `window.__raffi && window.__raffi.${command} && window.__raffi.${command}(); true;`
    );
  }, []);

  const loadLibraryItem = useCallback(async () => {
    if (!id) return;
    try {
      const storeItem = getItemProgress(id);
      const dbItem = storeItem ? null : await getLibraryItem(id);
      const item: LibraryItem | null = (storeItem || dbItem || null) as any;
      setLibraryItem(item);
    } catch {
      setLibraryItem(null);
    }
  }, [getItemProgress, id]);

  useEffect(() => {
    loadLibraryItem();
  }, [loadLibraryItem]);

  const resolveResumeTimeSeconds = useCallback(
    async (episode?: Episode | null): Promise<number> => {
      if (!id) return 0;

      const storeItem = getItemProgress(id);
      const dbItem = storeItem ? null : await getLibraryItem(id);
      const item: LibraryItem | null | undefined = storeItem || dbItem;

      const progress = (item as any)?.progress;
      if (!progress) return 0;

      // Movie-style progress: { time, duration, ... }
      if (!episode) {
        const t = Number(progress?.time);
        return Number.isFinite(t) && t > 0 ? Math.floor(t) : 0;
      }

      // Series-style progress: { "S:E": { time, ... }, ... }
      const key = `${episode.season}:${episode.episode}`;
      const t = Number(progress?.[key]?.time);
      return Number.isFinite(t) && t > 0 ? Math.floor(t) : 0;
    },
    [getItemProgress, id]
  );

  const fetchStreamsForAddon = useCallback(
    async (addonUrl: string, streamType: 'movie' | 'series', episode?: Episode | null) => {
      if (!addonUrl) return;
      setLoadingStreams(true);
      try {
        const list =
          streamType === 'movie'
            ? await fetchStreams(addonUrl, 'movie', id)
            : await fetchStreams(addonUrl, 'series', id, episode?.season, episode?.episode);

        setStreamsByAddon((prev) => ({ ...prev, [addonUrl]: list }));
      } catch (e) {
        console.error('Failed to fetch streams:', e);
        setStreamsByAddon((prev) => ({ ...prev, [addonUrl]: [] }));
      } finally {
        setLoadingStreams(false);
      }
    },
    [id]
  );

  useEffect(() => {
    const loadMeta = async () => {
      if (!id) return;

      setLoading(true);
      setError(null);

      try {
        // Try to determine type
        let metaType = type || 'movie';
        let data: ShowResponse | null = null;

        try {
          data = await getCachedMetaData(id, metaType);
        } catch {
          // Try the other type
          metaType = metaType === 'movie' ? 'series' : 'movie';
          data = await getCachedMetaData(id, metaType);
        }

        setMeta(data);

        // Process seasons for series
        if (data?.meta?.type === 'series' && data.meta.videos) {
          const uniqueSeasons = [...new Set(data.meta.videos.map((v) => v.season))].sort(
            (a, b) => a - b
          );
          setSeasons(uniqueSeasons);

          // Default to the first season; we may override based on progress below.
          const firstSeason = uniqueSeasons[0] || 1;
          setSelectedSeason(firstSeason);
          setSeasonEpisodes(
            data.meta.videos
              .filter((v) => v.season === firstSeason)
              .sort((a, b) => a.episode - b.episode)
          );
        }

        // Auto play if requested
        if (autoPlay === 'true' && data?.meta?.type === 'movie') {
          handlePlayMovie(data);
        }
      } catch (e: any) {
        console.error('Failed to load meta:', e);
        setError('Failed to load title information');
      }

      setLoading(false);
    };

    loadMeta();
  }, [id, type]);

  useEffect(() => {
    // Compute resume state once we have meta + library progress.
    if (!meta?.meta || !id) return;

    const progress: any = (libraryItem as any)?.progress;

    if (meta.meta.type !== 'series') {
      const t = Number(progress?.time);
      setResumeMovieSeconds(Number.isFinite(t) && t > 0 ? Math.floor(t) : 0);
      setResumeEpisode(null);
      return;
    }

    const videos = meta.meta.videos || [];
    const entries = progress && typeof progress === 'object' ? Object.entries(progress) : [];

    let best: { season: number; episode: number; updatedAt: number; time: number } | null = null;
    for (const [key, value] of entries) {
      if (!value || typeof value !== 'object') continue;
      const [sRaw, eRaw] = String(key).split(':');
      const s = Number(sRaw);
      const e = Number(eRaw);
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;

      const time = Number((value as any).time || 0);
      const duration = Number((value as any).duration || 0);
      const updatedAt = Number((value as any).updatedAt || 0);
      const watched = Boolean((value as any).watched) || (duration > 0 && time / duration > 0.9);

      // Prefer the most recently updated *unwatched* episode with some progress.
      if (watched || time <= 0) continue;

      if (!best) {
        best = { season: s, episode: e, updatedAt, time };
        continue;
      }

      if (updatedAt > best.updatedAt || (updatedAt === best.updatedAt && time > best.time)) {
        best = { season: s, episode: e, updatedAt, time };
      }
    }

    if (!best) {
      setResumeEpisode(null);
      return;
    }

    const episode = videos.find((v) => v.season === best.season && v.episode === best.episode) || null;
    setResumeEpisode(episode);

    // Auto-jump to the season where the user is currently resuming.
    if (episode && episode.season !== selectedSeason) {
      setSelectedSeason(episode.season);
      setSeasonEpisodes(
        videos
          .filter((v) => v.season === episode.season)
          .sort((a, b) => a.episode - b.episode)
      );
    }
  }, [id, libraryItem, meta, selectedSeason]);

  const handleSeasonChange = useCallback(
    (season: number) => {
      setSelectedSeason(season);
      if (meta?.meta?.videos) {
        setSeasonEpisodes(
          meta.meta.videos
            .filter((v) => v.season === season)
            .sort((a, b) => a.episode - b.episode)
        );
      }
    },
    [meta]
  );

  const handlePlayMovie = async (metaData?: ShowResponse) => {
    const data = metaData || meta;
    if (!data) return;

    setShowStreamsModal(true);
    setSelectedEpisode(null);

    // Only use stream-capable addons
    const streamAddons = filterStreamAddons(addons || []);
    const defaultAddonUrl = selectedAddon || streamAddons?.[0]?.transport_url || null;
    setSelectedAddonUrl(defaultAddonUrl);
    setStreamsByAddon({});

    if (defaultAddonUrl) {
      await fetchStreamsForAddon(defaultAddonUrl, 'movie', null);
    }
  };

  const handlePlayEpisode = async (episode: Episode) => {
    setShowStreamsModal(true);
    setSelectedEpisode(episode);

    // Only use stream-capable addons
    const streamAddons = filterStreamAddons(addons || []);
    const defaultAddonUrl = selectedAddon || streamAddons?.[0]?.transport_url || null;
    setSelectedAddonUrl(defaultAddonUrl);
    setStreamsByAddon({});

    if (defaultAddonUrl) {
      await fetchStreamsForAddon(defaultAddonUrl, 'series', episode);
    }
  };

  const handleSelectStream = async (stream: Stream) => {
    setShowStreamsModal(false);

    let videoSrc = stream.url;
    if (stream.infoHash) {
      videoSrc = `magnet:?xt=urn:btih:${stream.infoHash}`;
    }

    if (!videoSrc) {
      console.warn('No video source');
      return;
    }

    const resumeTime = await resolveResumeTimeSeconds(selectedEpisode);

    router.push({
      pathname: '/player',
      params: {
        videoSrc,
        title: meta?.meta?.name || '',
        imdbId: id,
        type: meta?.meta?.type || 'movie',
        poster: meta?.meta?.poster || '',
        season: selectedEpisode?.season?.toString() || '',
        episode: selectedEpisode?.episode?.toString() || '',
        fileIdx: stream.fileIdx?.toString() || '',
        startTime: resumeTime ? String(resumeTime) : '0',
      },
    });
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (error || !meta?.meta) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={60} color={Colors.error} />
          <Text style={styles.errorText}>{error || 'Title not found'}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { meta: data } = meta;
  const isSeries = data.type === 'series';

  const seriesProgress: any = isSeries ? (libraryItem as any)?.progress : null;
  const trailerHeight = (SCREEN_WIDTH * 9) / 16;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header (Netflix-style trailer if available) */}
        <View style={[styles.header, { height: insets.top + trailerHeight }]}>
          {/* Trailer hero starts below status bar */}
          <View style={[styles.trailerWrap, { top: insets.top, height: trailerHeight }]}>
            {trailerHtml && !trailerFailed ? (
              <>
                <WebView
                  ref={trailerWebViewRef}
                  originWhitelist={['*']}
                  source={{ html: trailerHtml, baseUrl: 'https://www.youtube-nocookie.com' }}
                  javaScriptEnabled
                  domStorageEnabled
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  onMessage={(event) => {
                    try {
                      const msg = JSON.parse(event.nativeEvent.data);
                      if (msg?.type === 'error') {
                        setTrailerFailed(true);
                      }
                      if (msg?.type === 'state') {
                        // 1 playing, 2 paused
                        if (msg.payload?.state === 1) setTrailerPlaying(true);
                        if (msg.payload?.state === 2) setTrailerPlaying(false);
                      }
                    } catch {
                      // ignore
                    }
                  }}
                  onError={() => setTrailerFailed(true)}
                  style={styles.trailerWebView}
                  // We want RN overlay controls, not WebView interaction.
                  pointerEvents="none"
                />

                {/* Trailer controls overlay (Netflix-ish) */}
                <Pressable
                  style={styles.trailerTapCatcher}
                  onPress={() => {
                    const nextPlaying = !trailerPlaying;
                    setTrailerPlaying(nextPlaying);
                    sendTrailerCommand(nextPlaying ? 'play' : 'pause');
                  }}
                />
                <View style={styles.trailerControls} pointerEvents="box-none">
                  <TouchableOpacity
                    style={styles.trailerControlButton}
                    onPress={() => {
                      const nextPlaying = !trailerPlaying;
                      setTrailerPlaying(nextPlaying);
                      sendTrailerCommand(nextPlaying ? 'play' : 'pause');
                    }}
                  >
                    <Ionicons name={trailerPlaying ? 'pause' : 'play'} size={18} color={Colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.trailerControlButton}
                    onPress={() => {
                      const nextMuted = !trailerMuted;
                      setTrailerMuted(nextMuted);
                      sendTrailerCommand(nextMuted ? 'mute' : 'unmute');
                    }}
                  >
                    <Ionicons name={trailerMuted ? 'volume-mute' : 'volume-high'} size={18} color={Colors.text} />
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <ImageBackground
                source={{ uri: data.background || data.poster || '' }}
                style={StyleSheet.absoluteFillObject}
              />
            )}
          </View>

          {/* Back Button overlay (on trailer, but below status bar) */}
          <TouchableOpacity
            style={[styles.navBackButton, styles.navBackButtonFloating, { top: insets.top + Spacing.sm, left: Spacing.lg }]}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* Title/Meta section (below trailer, Netflix-style) */}
        <View style={styles.titleInfo}>
          {data.logo ? (
            <Image source={{ uri: data.logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Text style={styles.title}>{data.name}</Text>
          )}

          {/* Meta Row */}
          <View style={styles.metaRow}>
            {data.year && <Text style={styles.metaText}>{data.year}</Text>}
            {data.imdbRating && (
              <>
                <View style={styles.dot} />
                <Ionicons name="star" size={14} color={Colors.warning} />
                <Text style={styles.metaText}>{data.imdbRating}</Text>
              </>
            )}
            {data.runtime && (
              <>
                <View style={styles.dot} />
                <Text style={styles.metaText}>{data.runtime}</Text>
              </>
            )}
            {isSeries && seasons.length > 0 && (
              <>
                <View style={styles.dot} />
                <Text style={styles.metaText}>{seasons.length} Seasons</Text>
              </>
            )}
          </View>

          {/* Genres */}
          {(data.genres || data.genre) && (
            <Text style={styles.genres}>{(data.genres || data.genre)?.slice(0, 3).join(' • ')}</Text>
          )}

          {/* Play Button (for movies) */}
          {!isSeries && (
            <TouchableOpacity style={styles.playButton} onPress={() => handlePlayMovie()}>
              <Ionicons name="play" size={24} color="#000" />
              <Text style={styles.playButtonText}>{resumeMovieSeconds > 0 ? 'Resume' : 'Play'}</Text>
            </TouchableOpacity>
          )}

          {/* Resume Button (for series) */}
          {isSeries && resumeEpisode && (
            <TouchableOpacity style={styles.playButton} onPress={() => handlePlayEpisode(resumeEpisode)}>
              <Ionicons name="play" size={24} color="#000" />
              <Text style={styles.playButtonText}>
                Resume S{resumeEpisode.season} • E{resumeEpisode.episode}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Description */}
        {data.description && (
          <View style={styles.section}>
            <Text style={styles.description}>{data.description}</Text>
          </View>
        )}

        {/* Series Episodes */}
        {isSeries && seasons.length > 0 && (
          <View style={styles.episodesSection}>
            {/* Season Selector */}
            <View style={styles.seasonSelector}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {seasons.map((season) => (
                  <TouchableOpacity
                    key={season}
                    style={[
                      styles.seasonButton,
                      selectedSeason === season && styles.seasonButtonActive,
                    ]}
                    onPress={() => handleSeasonChange(season)}
                  >
                    <Text
                      style={[
                        styles.seasonButtonText,
                        selectedSeason === season && styles.seasonButtonTextActive,
                      ]}
                    >
                      Season {season}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Episodes List */}
            {seasonEpisodes.map((episode) => (
              (() => {
                const progressKey = `${episode.season}:${episode.episode}`;
                const epProgress = seriesProgress?.[progressKey];
                const time = Number(epProgress?.time || 0);
                const duration = Number(epProgress?.duration || 0);
                const watched = Boolean(epProgress?.watched) || (duration > 0 && time / duration > 0.9);
                const hasProgress = !watched && time > 0;

                return (
              <TouchableOpacity
                key={episode.id}
                style={styles.episodeItem}
                onPress={() => handlePlayEpisode(episode)}
              >
                <View style={styles.episodeThumbnail}>
                  {episode.thumbnail ? (
                    <Image
                      source={{ uri: episode.thumbnail }}
                      style={styles.episodeThumbnailImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.episodePlaceholder}>
                      <Ionicons name="play" size={24} color={Colors.textMuted} />
                    </View>
                  )}
                  <View style={styles.episodePlayOverlay}>
                    <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.9)" />
                  </View>

                  {watched ? (
                    <View style={styles.episodeBadge}>
                      <Ionicons name="checkmark" size={14} color={Colors.background} />
                    </View>
                  ) : hasProgress ? (
                    <View style={styles.episodeBadgeResume}>
                      <Text style={styles.episodeBadgeResumeText}>Resume</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.episodeInfo}>
                  <Text style={styles.episodeNumber}>
                    E{episode.episode}
                  </Text>
                  <Text style={styles.episodeTitle} numberOfLines={1}>
                    {episode.name || `Episode ${episode.episode}`}
                  </Text>
                  {episode.overview && (
                    <Text style={styles.episodeOverview} numberOfLines={2}>
                      {episode.overview}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
                );
              })()
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Streams Modal */}
      <Modal
        visible={showStreamsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowStreamsModal(false)}
      >
        <StatusBar style="light" backgroundColor={Colors.overlay} translucent={false} />
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Stream</Text>
                <Text style={styles.modalSubtitle}>
                  Pick a source to start watching
                </Text>
              </View>
              <TouchableOpacity 
                onPress={() => setShowStreamsModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Addon Selector - only show addons with stream capability */}
            {(() => {
              const streamAddons = filterStreamAddons(addons || []);
              if (streamAddons.length <= 1) return null;
              return (
                <View style={styles.addonSelectorWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.addonSelectorContent}
                  >
                    {streamAddons.map((addon: Addon) => {
                      const url = addon.transport_url;
                      const isActive = url === selectedAddonUrl;
                      return (
                        <TouchableOpacity
                          key={url}
                          style={[styles.addonChip, isActive && styles.addonChipActive]}
                          onPress={async () => {
                            setSelectedAddonUrl(url);
                            const streamType = (meta?.meta?.type || 'movie') as 'movie' | 'series';
                            const existing = streamsByAddon[url];
                            if (!existing) {
                              await fetchStreamsForAddon(url, streamType, selectedEpisode);
                            }
                          }}
                        >
                          <Text
                            style={[styles.addonChipText, isActive && styles.addonChipTextActive]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {addon.manifest?.name || addon.addon_id}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })()}

            <View style={styles.modalBody}>
            {!selectedAddonUrl ? (
              <View style={styles.modalEmpty}>
                <Ionicons name="extension-puzzle-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.modalEmptyText}>No streaming addons installed</Text>
              </View>
            ) : null}

            {loadingStreams ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.modalLoadingText}>Loading streams...</Text>
              </View>
            ) : !selectedAddonUrl || (streamsByAddon[selectedAddonUrl] || []).length === 0 ? (
              selectedAddonUrl && (
                <View style={styles.modalEmpty}>
                  <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.modalEmptyText}>No streams available</Text>
                </View>
              )
            ) : (
              <FlatList
                data={streamsByAddon[selectedAddonUrl] || []}
                keyExtractor={(item, idx) => `${item.infoHash || item.url}-${idx}`}
                style={styles.streamsListFlex}
                renderItem={({ item }) => {
                  const streamMeta = parseStreamMetadata(item);
                  return (
                    <TouchableOpacity
                      style={styles.streamCard}
                      onPress={() => handleSelectStream(item)}
                      activeOpacity={0.7}
                    >
                      {/* Provider + Status badges row */}
                      <View style={styles.streamCardHeader}>
                        <View style={styles.streamProviderCol}>
                          <Text style={styles.streamProvider} numberOfLines={1}>
                            {streamMeta.providerLabel}
                          </Text>
                          {streamMeta.infoLine && (
                            <Text style={styles.streamHost}>{streamMeta.infoLine}</Text>
                          )}
                          {streamMeta.isP2P && streamMeta.peerCount != null && (
                            <View style={styles.streamPeersRow}>
                              <Ionicons name="globe-outline" size={12} color={Colors.textSecondary} />
                              <Text style={styles.streamPeersText}>
                                {streamMeta.peerCount} peers
                              </Text>
                            </View>
                          )}
                        </View>
                        {streamMeta.statusBadges.length > 0 && (
                          <View style={styles.streamStatusBadges}>
                            {streamMeta.statusBadges.map((badge) => (
                              <View
                                key={badge.label}
                                style={[
                                  styles.streamBadge,
                                  badge.variant === 'accent' && styles.streamBadgeAccent,
                                  badge.variant === 'outline' && styles.streamBadgeOutline,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.streamBadgeText,
                                    badge.variant === 'accent' && styles.streamBadgeTextAccent,
                                  ]}
                                >
                                  {badge.label}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>

                      {/* Feature badges row */}
                      {streamMeta.featureBadges.length > 0 && (
                        <View style={styles.streamFeatureBadges}>
                          {streamMeta.featureBadges.map((badge) => (
                            <View
                              key={badge.label}
                              style={[
                                styles.streamFeatureBadge,
                                badge.variant === 'muted' && styles.streamFeatureBadgeMuted,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.streamFeatureBadgeText,
                                  badge.variant === 'muted' && styles.streamFeatureBadgeTextMuted,
                                ]}
                              >
                                {badge.label}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
                contentContainerStyle={styles.streamsList}
                ListHeaderComponent={
                  <Text style={styles.streamsCount}>
                    {(streamsByAddon[selectedAddonUrl] || []).length} source
                    {(streamsByAddon[selectedAddonUrl] || []).length !== 1 ? 's' : ''}
                  </Text>
                }
              />
            )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    width: SCREEN_WIDTH,
  },
  trailerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: Colors.background,
  },
  trailerWebView: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  trailerTapCatcher: {
    ...StyleSheet.absoluteFillObject,
  },
  trailerControls: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  trailerControlButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBackButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBackButtonFloating: {
    position: 'absolute',
    zIndex: 10,
  },
  titleInfo: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    marginTop: -50,
    paddingBottom: Spacing.xl,
  },
  logo: {
    width: SCREEN_WIDTH * 0.6,
    height: 60,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.sizes.hero,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  metaText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  genres: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FFFFFF',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
  playButtonText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: '#000',
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  description: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  castText: {
    fontSize: Typography.sizes.md,
    color: Colors.text,
    lineHeight: 22,
  },
  directorText: {
    fontSize: Typography.sizes.md,
    color: Colors.text,
  },
  episodesSection: {
    marginTop: Spacing.xl,
  },
  seasonSelector: {
    paddingLeft: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  seasonButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: Spacing.sm,
  },
  seasonButtonActive: {
    backgroundColor: Colors.text,
  },
  seasonButtonText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  seasonButtonTextActive: {
    color: Colors.background,
  },
  episodeItem: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  episodeThumbnail: {
    width: 140,
    height: 80,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  episodeThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  episodePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodePlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  episodeInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  episodeNumber: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  episodeTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
    marginBottom: 6,
  },
  episodeOverview: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  errorText: {
    fontSize: Typography.sizes.lg,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xxl,
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.full,
  },
  backButtonText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    height: SCREEN_HEIGHT * 0.8,
    overflow: 'hidden',
  },
  modalBody: {
    flex: 1,
    minHeight: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addonSelectorWrap: {
    height: 56,
    marginBottom: Spacing.sm,
  },
  addonSelectorContent: {
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    height: 56,
  },
  addonChip: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginRight: Spacing.sm,
  },
  addonChipActive: {
    backgroundColor: Colors.text,
  },
  addonChipText: {
    fontSize: Typography.sizes.sm,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: Typography.weights.medium,
  },
  addonChipTextActive: {
    color: Colors.background,
  },
  modalLoading: {
    padding: Spacing.xxxl,
    alignItems: 'center',
  },
  modalLoadingText: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  modalEmpty: {
    padding: Spacing.xxxl,
    alignItems: 'center',
  },
  modalEmptyText: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  streamsListFlex: {
    flex: 1,
  },
  streamsList: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  streamsCount: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  // Stream card - matching desktop style
  streamCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  streamCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  streamProviderCol: {
    flex: 1,
    gap: 2,
  },
  streamProvider: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  streamHost: {
    fontSize: 10,
    fontWeight: Typography.weights.medium,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  streamPeersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  streamPeersText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
  },
  streamStatusBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    justifyContent: 'flex-end',
  },
  streamBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  streamBadgeAccent: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
  },
  streamBadgeOutline: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  streamBadgeText: {
    fontSize: 11,
    fontWeight: Typography.weights.semibold,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  streamBadgeTextAccent: {
    color: Colors.background,
  },
  streamFeatureBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  streamFeatureBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  streamFeatureBadgeMuted: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  streamFeatureBadgeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
    color: Colors.text,
    letterSpacing: 0.3,
  },
  streamFeatureBadgeTextMuted: {
    color: 'rgba(255,255,255,0.5)',
  },
  // Keep old stream styles for compatibility
  streamItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  streamInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  streamName: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium,
    color: Colors.text,
  },
  streamDesc: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  episodeBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeBadgeResume: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.overlayLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  episodeBadgeResumeText: {
    fontSize: Typography.sizes.xs,
    color: Colors.text,
    fontWeight: Typography.weights.semibold,
  },
});
