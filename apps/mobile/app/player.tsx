import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { GlassSurface } from '@/components/GlassSurface';
import { createBridgePlayback, deleteBridgePlayback } from '@/lib/bridge';
import { useApp } from '@/state/AppContext';

export default function Player() {
  const params = useLocalSearchParams<{ src: string; desktop?: string; fileIndex?: string; imdbId: string; type: 'movie' | 'series'; title?: string; poster?: string; season?: string; episode?: string }>();
  const { desktops, getDesktopToken, saveProgress } = useApp();
  const [url, setUrl] = React.useState(params.desktop === '1' ? '' : params.src);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(params.desktop === '1');
  const [showBridge, setShowBridge] = React.useState(params.desktop === '1' && desktops.length === 0);
  const [trackOpen, setTrackOpen] = React.useState(false);
  const bridgeSession = React.useRef<{ desktopId: string; sessionId: string } | null>(null);
  const player = useVideoPlayer(url || null, (instance) => { instance.loop = false; instance.timeUpdateEventInterval = 1; if (url) instance.play(); });
  const startBridge = React.useCallback(async () => {
    const desktop = desktops[0];
    if (!desktop) { setShowBridge(true); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const token = await getDesktopToken(desktop.id);
      if (!token) throw new Error('The desktop pairing has expired');
      const session = await createBridgePlayback(desktop.baseUrl, token, { source: params.src, fileIndex: params.fileIndex ? Number(params.fileIndex) : undefined, startSeconds: 0 });
      bridgeSession.current = { desktopId: desktop.id, sessionId: session.id };
      setUrl(session.playbackUrl); setLoading(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); setShowBridge(true); }
  }, [desktops, getDesktopToken, params.fileIndex, params.src]);
  React.useEffect(() => { if (params.desktop !== '1' || !desktops.length) return; const timer = setTimeout(() => void startBridge(), 0); return () => clearTimeout(timer); }, [desktops.length, params.desktop, startBridge]);
  React.useEffect(() => {
    const subscription = (player as any).addListener?.('statusChange', ({ status, error: eventError }: any) => {
      if (status === 'error') { setError(eventError?.message || 'This format cannot play directly on this device.'); setShowBridge(true); }
    });
    return () => subscription?.remove?.();
  }, [player]);
  React.useEffect(() => () => {
    const duration = Number((player as any).duration || 0); const position = Number((player as any).currentTime || 0);
    if (params.imdbId && duration > 0) void saveProgress({ imdbId: params.imdbId, type: params.type, positionSeconds: position, durationSeconds: duration, season: params.season ? Number(params.season) : undefined, episode: params.episode ? Number(params.episode) : undefined, poster: params.poster, updatedAt: new Date().toISOString() });
    const active = bridgeSession.current; const desktop = active && desktops.find((item) => item.id === active.desktopId);
    if (active && desktop) void getDesktopToken(desktop.id).then((token) => token ? deleteBridgePlayback(desktop.baseUrl, token, active.sessionId) : undefined);
  }, [desktops, getDesktopToken, params.episode, params.imdbId, params.poster, params.season, params.type, player, saveProgress]);
  const audioTracks: any[] = (player as any).availableAudioTracks ?? []; const subtitleTracks: any[] = (player as any).availableSubtitleTracks ?? [];
  const selectAudio = (track: any) => {
    // Expo Video exposes track selection as a mutable native player property.
    // eslint-disable-next-line react-hooks/immutability
    (player as any).audioTrack = track;
    setTrackOpen(false);
  };
  const selectSubtitle = (track: any) => {
    // eslint-disable-next-line react-hooks/immutability
    (player as any).subtitleTrack = track;
    setTrackOpen(false);
  };
  return <View className="flex-1 bg-black">
    {url ? <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls allowsPictureInPicture startsPictureInPictureAutomatically /> : <View className="flex-1" />}
    <View className="absolute left-5 right-5 top-12 flex-row items-center justify-between"><GlassSurface style={{ borderRadius: 25 }}><Pressable onPress={() => router.back()} className="h-12 w-12 items-center justify-center"><Ionicons name="close" size={25} color="white" /></Pressable></GlassSurface><Text numberOfLines={1} className="mx-5 flex-1 text-center text-base font-semibold text-white">{params.title}</Text><GlassSurface style={{ borderRadius: 25 }}><Pressable onPress={() => setTrackOpen(true)} className="h-12 w-12 items-center justify-center"><Ionicons name="options-outline" size={23} color="white" /></Pressable></GlassSurface></View>
    {loading && <View className="absolute inset-0 items-center justify-center bg-black/70"><ActivityIndicator color="white" size="large" /><Text className="mt-4 text-white">Preparing on Raffi Desktop…</Text></View>}
    <Modal transparent visible={showBridge} animationType="fade" onRequestClose={() => setShowBridge(false)}><View className="flex-1 items-center justify-center bg-black/75 p-6"><GlassSurface style={{ borderRadius: 28 }} className="w-full max-w-xl p-7"><Text className="text-2xl font-bold text-ink">Desktop needed</Text><Text className="mt-3 text-base leading-6 text-muted">{error || 'This source needs Raffi Desktop to prepare a compatible stream.'}</Text>{desktops.length ? <Pressable onPress={() => { setShowBridge(false); void startBridge(); }} className="mt-6 items-center rounded-2xl bg-white py-4"><Text className="font-bold text-black">Play through {desktops[0]?.name}</Text></Pressable> : <Pressable onPress={() => { setShowBridge(false); router.replace('/pair'); }} className="mt-6 items-center rounded-2xl bg-white py-4"><Text className="font-bold text-black">Pair Raffi Desktop</Text></Pressable>}<Pressable onPress={() => router.back()} className="mt-3 items-center py-3"><Text className="font-semibold text-muted">Choose another source</Text></Pressable></GlassSurface></View></Modal>
    <Modal transparent visible={trackOpen} animationType="fade" onRequestClose={() => setTrackOpen(false)}><Pressable onPress={() => setTrackOpen(false)} className="flex-1 justify-end bg-black/45 p-4"><GlassSurface style={{ borderRadius: 28 }} className="p-6"><Text className="text-xl font-bold text-ink">Audio</Text>{audioTracks.map((track, index) => <Pressable key={track.id || index} onPress={() => selectAudio(track)} className="py-3"><Text className="text-ink">{track.label || track.language || `Track ${index + 1}`}</Text></Pressable>)}<Text className="mt-5 text-xl font-bold text-ink">Subtitles</Text><Pressable onPress={() => selectSubtitle(null)} className="py-3"><Text className="text-ink">Off</Text></Pressable>{subtitleTracks.map((track, index) => <Pressable key={track.id || index} onPress={() => selectSubtitle(track)} className="py-3"><Text className="text-ink">{track.label || track.language || `Subtitle ${index + 1}`}</Text></Pressable>)}</GlassSurface></Pressable></Modal>
  </View>;
}
