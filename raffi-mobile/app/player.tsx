import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Brightness from 'expo-brightness';
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Platform,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    PanResponder,
    GestureResponderEvent,
    AppState,
} from 'react-native';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    withSequence,
    withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { getLibraryItem, traktScrobble } from '@/lib/db';
import { useLibraryStore } from '@/lib/stores/libraryStore';
import TorrentStreamer, { StreamSession } from '@/lib/torrent/TorrentStreamer';

// Try to import PiP module (Android only, requires development build)
let ExpoPip: any = null;
let isPipModuleAvailable = false;
try {
  ExpoPip = require('expo-pip');
  // Check if the module is actually functional (not just importable)
  isPipModuleAvailable = typeof ExpoPip?.isPipSupported === 'function';
} catch (e) {
  // PiP not available in Expo Go
  isPipModuleAvailable = false;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Double tap detection helper
const DOUBLE_TAP_DELAY = 300;
const SEEK_AMOUNT = 10; // seconds

// Skip intro constants - typical TV intro durations
const INTRO_START_TIME = 0; // Intro usually starts at beginning
const INTRO_END_TIME = 90; // Most intros are under 90 seconds
const INTRO_SKIP_TO = 90; // Skip to 90 seconds
const TRAKT_COMPLETION_THRESHOLD = 0.9;
const TRAKT_FAILURE_COOLDOWN_MS = 60000;
const TRAKT_MAX_FAILURES = 3;
const MAX_TORRENT_PLAYBACK_RETRIES = 6;

// Settings keys
const SETTINGS_KEYS = {
  AUTO_SKIP_INTRO: 'settings_auto_skip_intro',
};

export default function PlayerScreen() {
  const {
    videoSrc,
    title,
    imdbId,
    type,
    poster,
    season,
    episode,
    fileIdx,
    startTime: startTimeParam,
    // New params for next episode support
    nextEpisodeSrc,
    nextEpisodeTitle,
    nextEpisodeSeason,
    nextEpisodeNumber,
  } = useLocalSearchParams<{
    videoSrc: string;
    title?: string;
    imdbId?: string;
    type?: string;
    poster?: string;
    season?: string;
    episode?: string;
    fileIdx?: string;
    startTime?: string;
    nextEpisodeSrc?: string;
    nextEpisodeTitle?: string;
    nextEpisodeSeason?: string;
    nextEpisodeNumber?: string;
  }>();

  const insets = useSafeAreaInsets();

  // Player state
  const [loading, setLoading] = useState(true);
  const { updateProgress, getItemProgress } = useLibraryStore();
  const [error, setError] = useState<string | null>(null);
  const didInitialSeek = useRef(false);
  const seriesProgressRef = useRef<Record<string, any> | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewTime, setSeekPreviewTime] = useState<number | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [torrentSession, setTorrentSession] = useState<StreamSession | null>(null);
  const torrentSessionRef = useRef<StreamSession | null>(null);
  const torrentPlaybackRetriesRef = useRef(0);
  const torrentRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [torrentStatus, setTorrentStatus] = useState<string>('');
  const [isLocked, setIsLocked] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const playerRef = useRef<any>(null);
  
  // Double-tap seek state
  const [seekFeedback, setSeekFeedback] = useState<{ side: 'left' | 'right'; amount: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const seekFeedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveSeekAmount = useRef(0);
  
  // Next episode state
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const nextEpisodeCountdown = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Skip intro state
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [autoSkipEnabled, setAutoSkipEnabled] = useState(false);
  const didAutoSkip = useRef(false);

  // PiP state
  const [isPipSupported, setIsPipSupported] = useState(false);
  const [isInPipMode, setIsInPipMode] = useState(false);

  // Volume/Brightness gesture state
  const [brightness, setBrightness] = useState(0.5);
  const [volume, setVolume] = useState(1);
  const [showVolumeIndicator, setShowVolumeIndicator] = useState(false);
  const [showBrightnessIndicator, setShowBrightnessIndicator] = useState(false);
  const volumeIndicatorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brightnessIndicatorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialBrightness = useRef(0.5);
  const initialVolume = useRef(1);
  const gestureStartY = useRef(0);
  const gestureStartValue = useRef(0);
  const activeGesture = useRef<'brightness' | 'volume' | 'seek' | null>(null);

  // Playback speed state
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<'root' | 'subtitles' | 'audio' | 'speed'>('root');
  const [availableSubtitleTracks, setAvailableSubtitleTracks] = useState<any[]>([]);
  const [availableAudioTracks, setAvailableAudioTracks] = useState<any[]>([]);
  const [selectedSubtitleLabel, setSelectedSubtitleLabel] = useState<string>('Off');
  const [selectedAudioLabel, setSelectedAudioLabel] = useState<string>('Default');

  const controlsOpacity = useSharedValue(1);
  const seekFeedbackOpacity = useSharedValue(0);
  const seekFeedbackScale = useSharedValue(1);
  const skipIntroOpacity = useSharedValue(0);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressSaveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedTime = useRef(0);
  const progressBarRef = useRef<View>(null);
  const progressBarWidth = useRef(0);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const lastTraktActionRef = useRef<'start' | 'pause' | 'stop' | null>(null);
  const lastTraktActionAtRef = useRef(0);
  const traktStopSentRef = useRef(false);
  const traktStartSentRef = useRef(false);
  const traktDisabledRef = useRef(false);
  const traktFailureCountRef = useRef(0);
  const traktCooldownUntilRef = useRef(0);

  // Check PiP support and initialize brightness on mount
  useEffect(() => {
    const checkPipSupport = async () => {
      if (Platform.OS === 'android' && isPipModuleAvailable && ExpoPip) {
        try {
          const supported = await ExpoPip.isPipSupported();
          setIsPipSupported(supported);
        } catch (e) {
          // PiP requires a development build, not Expo Go
          console.log('PiP requires development build');
          setIsPipSupported(false);
        }
      }
    };
    checkPipSupport();

    // Initialize brightness
    const initBrightness = async () => {
      try {
        const currentBrightness = await Brightness.getBrightnessAsync();
        setBrightness(currentBrightness);
        initialBrightness.current = currentBrightness;
      } catch (e) {
        // ignore
      }
    };
    initBrightness();

    // Load auto-skip setting
    const loadAutoSkipSetting = async () => {
      try {
        const value = await AsyncStorage.getItem(SETTINGS_KEYS.AUTO_SKIP_INTRO);
        setAutoSkipEnabled(value === 'true');
      } catch (e) {
        // ignore
      }
    };
    loadAutoSkipSetting();

    // Cleanup: restore brightness on unmount
    return () => {
      Brightness.setBrightnessAsync(initialBrightness.current).catch(() => {});
    };
  }, []);

  // Handle app state changes for PiP
  useEffect(() => {
    if (!isPipSupported || !isPipModuleAvailable || !ExpoPip) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' && isPlaying && playbackUrl) {
        // Automatically enter PiP when going to background while playing
        enterPipMode();
      }
    });

    // Listen for PiP mode changes
    let pipListener: any = null;
    try {
      pipListener = ExpoPip.addListener?.('pipModeChanged', (event: { isInPipMode: boolean }) => {
        setIsInPipMode(event.isInPipMode);
        if (!event.isInPipMode) {
          // Exited PiP, ensure landscape
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        }
      });
    } catch (e) {
      // Listener not available
    }

    return () => {
      subscription.remove();
      pipListener?.remove?.();
    };
  }, [isPipSupported, isPlaying, playbackUrl]);

  // Enter PiP mode
  const enterPipMode = useCallback(async () => {
    if (!isPipSupported || !isPipModuleAvailable || !ExpoPip) return;
    
    try {
      await ExpoPip.enterPipMode({
        width: 16,
        height: 9,
      });
      setIsInPipMode(true);
    } catch (e) {
      console.log('Failed to enter PiP:', e);
    }
  }, [isPipSupported]);

  // Determine the playback URL
  useEffect(() => {
    const setupPlayback = async () => {
      if (!videoSrc) {
        setError('No video source provided');
        setLoading(false);
        return;
      }

      try {
        // For HTTP streams (including debrid), use directly
        if (videoSrc.startsWith('http://') || videoSrc.startsWith('https://')) {
          setPlaybackUrl(videoSrc);
          setLoading(false);
          return;
        }

        // For magnet links, use on-device torrent streaming
        if (videoSrc.startsWith('magnet:')) {
          setLoading(true);
          setTorrentStatus('Initializing torrent client...');
          
          if (!TorrentStreamer.isAvailable()) {
            setError(
              Platform.OS === 'ios'
                ? 'Torrent streaming on iOS is coming soon. Please use a debrid service (Real-Debrid, AllDebrid, Premiumize) for instant playback.'
                : 'Torrent streaming requires a development build. Please rebuild the app with native modules enabled, or use a debrid service for instant playback.'
            );
            setLoading(false);
            return;
          }
          
          const parsedFileIndex = fileIdx != null ? Number(fileIdx) : NaN;
          const safeFileIndex = Number.isFinite(parsedFileIndex) && parsedFileIndex >= 0
            ? Math.floor(parsedFileIndex)
            : undefined;

          const session = await TorrentStreamer.startStream(
            videoSrc,
            safeFileIndex
          );
          
          setTorrentSession(session);
          torrentSessionRef.current = session;
          
          if (session.status === 'error') {
            setError(session.error || 'Failed to start torrent stream');
            setLoading(false);
            return;
          }
          
          const unsubscribe = TorrentStreamer.subscribe(session.id, (updatedSession) => {
            setTorrentSession(updatedSession);
            
            if (updatedSession.status === 'downloading_metadata') {
              setTorrentStatus('Fetching torrent metadata...');
            } else if (updatedSession.status === 'buffering') {
              setTorrentStatus(`Buffering: ${updatedSession.bufferProgress.toFixed(1)}%`);
            } else if (updatedSession.status === 'ready') {
              setPlaybackUrl(updatedSession.streamUrl);
              setTorrentStatus('');
              setLoading(false);
            } else if (updatedSession.status === 'error') {
              setError(updatedSession.error || 'Torrent streaming error');
              setLoading(false);
            }
          });

          return () => {
            unsubscribe?.();
          };
        }

        // For local files
        setPlaybackUrl(videoSrc);
        setLoading(false);
      } catch (e: any) {
        console.error('Failed to setup playback:', e);
        setError(e.message || 'Failed to load video');
        setLoading(false);
      }
    };

    let cleanupSubscription: (() => void) | undefined;
    (async () => {
      const maybeCleanup = await setupPlayback();
      if (typeof maybeCleanup === 'function') {
        cleanupSubscription = maybeCleanup;
      }
    })();

    return () => {
      cleanupSubscription?.();
      if (torrentSessionRef.current) {
        TorrentStreamer.stopStream(torrentSessionRef.current.id);
        torrentSessionRef.current = null;
      }
    };
  }, [videoSrc, fileIdx, startTimeParam]);

  const player = useVideoPlayer(playbackUrl || null, (player) => {
    player.loop = false;
  });

  // Keep playerRef in sync
  useEffect(() => {
    playerRef.current = player;
    return () => {
      playerRef.current = null;
    };
  }, [player]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    lastTraktActionRef.current = null;
    lastTraktActionAtRef.current = 0;
    traktStopSentRef.current = false;
    traktStartSentRef.current = false;
    traktDisabledRef.current = false;
    traktFailureCountRef.current = 0;
    traktCooldownUntilRef.current = 0;
  }, [imdbId, season, episode, videoSrc]);

  const getTraktProgress = useCallback(() => {
    const d = durationRef.current;
    if (!d || d <= 0) return 0;
    return Math.max(0, Math.min(100, (currentTimeRef.current / d) * 100));
  }, []);

  const sendTraktEvent = useCallback(
    async (action: 'start' | 'pause' | 'stop', force = false) => {
      if (!imdbId || !type) return;
      if (traktDisabledRef.current) return;
      if (!force && Date.now() < traktCooldownUntilRef.current) return;
      if (action === 'pause' && !traktStartSentRef.current) return;

      const mediaType = type === 'series' ? 'episode' : 'movie';
      const seasonNum = season != null ? Number(season) : undefined;
      const episodeNum = episode != null ? Number(episode) : undefined;
      if (mediaType === 'episode' && (!Number.isFinite(seasonNum) || !Number.isFinite(episodeNum))) {
        return;
      }
      if (action !== 'start' && currentTimeRef.current <= 0) {
        return;
      }

      const now = Date.now();
      if (
        !force &&
        lastTraktActionRef.current === action &&
        now - lastTraktActionAtRef.current < 10000
      ) {
        return;
      }

      lastTraktActionRef.current = action;
      lastTraktActionAtRef.current = now;

      if (action === 'start') {
        traktStopSentRef.current = false;
      } else if (action === 'stop') {
        traktStopSentRef.current = true;
      }

      try {
        const result: any = await traktScrobble({
          action,
          imdbId,
          mediaType,
          season: mediaType === 'episode' ? seasonNum : undefined,
          episode: mediaType === 'episode' ? episodeNum : undefined,
          progress: getTraktProgress(),
          appVersion: 'mobile',
        });

        if (result?.ok) {
          traktFailureCountRef.current = 0;
          traktCooldownUntilRef.current = 0;
          if (action === 'start') {
            traktStartSentRef.current = true;
          }
          return;
        }

        const reason = String(result?.reason || '');
        if (
          reason === 'not_connected' ||
          reason === 'not_configured' ||
          reason === 'missing_episode' ||
          reason === 'local_mode'
        ) {
          traktDisabledRef.current = true;
          return;
        }

        traktFailureCountRef.current += 1;
        if (traktFailureCountRef.current >= TRAKT_MAX_FAILURES) {
          traktCooldownUntilRef.current = Date.now() + TRAKT_FAILURE_COOLDOWN_MS;
          traktFailureCountRef.current = 0;
        }
      } catch {
        traktFailureCountRef.current += 1;
        if (traktFailureCountRef.current >= TRAKT_MAX_FAILURES) {
          traktCooldownUntilRef.current = Date.now() + TRAKT_FAILURE_COOLDOWN_MS;
          traktFailureCountRef.current = 0;
        }
      }
    },
    [episode, getTraktProgress, imdbId, season, type]
  );

  useEffect(() => {
    return () => {
      if (torrentRetryTimeoutRef.current) {
        clearTimeout(torrentRetryTimeoutRef.current);
        torrentRetryTimeoutRef.current = null;
      }
      if (!traktStopSentRef.current && currentTimeRef.current > 0) {
        void sendTraktEvent('stop', true);
      }
    };
  }, [sendTraktEvent]);

  // Subscribe to player events
  useEffect(() => {
    if (!player) return;

    const statusSubscription = player.addListener('statusChange', (payload) => {
      const status = payload.status;
      if (status === 'readyToPlay') {
        torrentPlaybackRetriesRef.current = 0;
        setLoading(false);
        setBuffering(false);
        setDuration(player.duration);

        if (!didInitialSeek.current) {
          const startSeconds = Number(startTimeParam || '0');
          if (Number.isFinite(startSeconds) && startSeconds > 0) {
            try {
              player.currentTime = startSeconds;
              setCurrentTime(startSeconds);
            } catch {
              // ignore
            }
          }
          didInitialSeek.current = true;
        }

        player.play();
      } else if (status === 'loading') {
        if (playbackUrl) {
          setBuffering(true);
        }
      } else if (status === 'error') {
        if (playbackUrl) {
          console.error('Video player error for URL:', playbackUrl);

          const isLocalTorrentStream = playbackUrl.startsWith('http://127.0.0.1:8765/stream/');
          const activeTorrent = torrentSessionRef.current;

          if (
            isLocalTorrentStream &&
            activeTorrent &&
            activeTorrent.status !== 'error' &&
            torrentPlaybackRetriesRef.current < MAX_TORRENT_PLAYBACK_RETRIES
          ) {
            const retry = torrentPlaybackRetriesRef.current + 1;
            torrentPlaybackRetriesRef.current = retry;

            setLoading(true);
            setBuffering(true);
            setError(null);
            setTorrentStatus(`Buffering stream... retry ${retry}/${MAX_TORRENT_PLAYBACK_RETRIES}`);

            if (torrentRetryTimeoutRef.current) {
              clearTimeout(torrentRetryTimeoutRef.current);
            }

            const retryDelayMs = Math.min(4000, 900 + retry * 500);
            torrentRetryTimeoutRef.current = setTimeout(() => {
              const base = playbackUrl.split('?')[0];
              setPlaybackUrl(null);
              setTimeout(() => {
                setPlaybackUrl(`${base}?r=${Date.now()}-${retry}`);
              }, 100);
            }, retryDelayMs);
            return;
          }

          setError('Failed to play video');
          setLoading(false);
        }
      }
    });

    const playingSubscription = player.addListener('playingChange', (payload) => {
      setIsPlaying(payload.isPlaying);
      setBuffering(false);
      if (payload.isPlaying) {
        void sendTraktEvent('start');
      } else if (
        !traktStopSentRef.current &&
        !(
          durationRef.current > 0 &&
          currentTimeRef.current / durationRef.current >= TRAKT_COMPLETION_THRESHOLD
        )
      ) {
        void sendTraktEvent('pause');
      }
    });

    const sourceLoadSubscription = player.addListener('sourceLoad', (payload: any) => {
      const subtitles = payload?.availableSubtitleTracks ?? player.availableSubtitleTracks ?? [];
      const audio = payload?.availableAudioTracks ?? player.availableAudioTracks ?? [];
      setAvailableSubtitleTracks(subtitles);
      setAvailableAudioTracks(audio);

      const subtitleLabel = player.subtitleTrack?.label || (player.subtitleTrack ? 'Subtitles' : 'Off');
      const audioLabel = player.audioTrack?.label || (player.audioTrack ? 'Audio' : 'Default');
      setSelectedSubtitleLabel(subtitleLabel);
      setSelectedAudioLabel(audioLabel);
    });

    return () => {
      statusSubscription.remove();
      playingSubscription.remove();
      sourceLoadSubscription.remove();
    };
  }, [player, playbackUrl, sendTraktEvent]);

  // Check for skip intro and next episode triggers
  useEffect(() => {
    if (!player || !duration) return;

    const interval = setInterval(() => {
      if (!isSeeking && player.currentTime !== undefined) {
        const time = player.currentTime;
        setCurrentTime(time);
        currentTimeRef.current = time;
        const d = player.duration || 0;
        setDuration(d);
        durationRef.current = d;

        if (
          !traktStopSentRef.current &&
          d > 0 &&
          time / d >= TRAKT_COMPLETION_THRESHOLD
        ) {
          void sendTraktEvent('stop', true);
        }
        
        // Skip intro logic (only for series)
        if (type === 'series' && duration > 300) { // Only for episodes longer than 5 min
          const startTime = Number(startTimeParam || '0');
          const isNewEpisode = startTime < 30; // Starting from near beginning
          
          if (isNewEpisode && !didAutoSkip.current) {
            // Show skip intro button in first 90 seconds (if not resuming)
            if (time >= 5 && time < INTRO_END_TIME) {
              if (!showSkipIntro) {
                setShowSkipIntro(true);
                skipIntroOpacity.value = withTiming(1, { duration: 300 });
              }
              
              // Auto-skip if enabled
              if (autoSkipEnabled && time >= 10 && time < 15) {
                handleSkipIntro();
              }
            } else if (time >= INTRO_END_TIME && showSkipIntro) {
              skipIntroOpacity.value = withTiming(0, { duration: 300 });
              setTimeout(() => setShowSkipIntro(false), 300);
            }
          }
        }
        
        // Check for next episode trigger (90% watched)
        if (duration > 0 && time / duration > 0.9 && nextEpisodeSrc && !showNextEpisode) {
          setShowNextEpisode(true);
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [player, isSeeking, duration, nextEpisodeSrc, showNextEpisode, type, startTimeParam, autoSkipEnabled, showSkipIntro, sendTraktEvent]);

  // Lock to landscape on mount
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    StatusBar.setHidden(true);

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      StatusBar.setHidden(false);
      if (nextEpisodeCountdown.current) {
        clearTimeout(nextEpisodeCountdown.current);
      }
    };
  }, []);

  // Save progress periodically
  useEffect(() => {
    if (!imdbId || !type) return;

    if (type === 'series' && seriesProgressRef.current == null) {
      (async () => {
        const storeExisting = getItemProgress(imdbId)?.progress;
        const dbExisting = storeExisting ? null : (await getLibraryItem(imdbId))?.progress;
        const existing = storeExisting || dbExisting;

        if (existing && typeof existing === 'object') {
          seriesProgressRef.current = { ...(existing as any) };
        } else {
          seriesProgressRef.current = {};
        }
      })();
    }

    progressSaveInterval.current = setInterval(() => {
      if (currentTime > 0 && duration > 0 && currentTime !== lastSavedTime.current) {
        lastSavedTime.current = currentTime;
        saveProgress();
      }
    }, 10000);

    return () => {
      if (progressSaveInterval.current) {
        clearInterval(progressSaveInterval.current);
      }
      saveProgress();
    };
  }, [imdbId, type, currentTime, duration]);

  const saveProgress = async () => {
    if (!imdbId || !type || currentTime <= 0) return;

    try {
      const watched = duration > 0 && currentTime / duration > 0.9;
      const progressData: any = {
        time: currentTime,
        duration: duration,
        updatedAt: Date.now(),
        watched,
      };

      if (type === 'series' && season && episode) {
        const key = `${season}:${episode}`;
        const base = seriesProgressRef.current || {};
        const merged = { ...base, [key]: progressData };
        seriesProgressRef.current = merged;
        await updateProgress(imdbId, merged, type, watched, poster);
      } else {
        await updateProgress(imdbId, progressData, type, watched, poster);
      }
    } catch (e) {
      console.error('Failed to save progress:', e);
    }
  };

  // Skip intro handler
  const handleSkipIntro = useCallback(() => {
    if (!player || !duration) return;
    
    didAutoSkip.current = true;
    const skipTo = Math.min(INTRO_SKIP_TO, duration - 60); // Don't skip past 1 min before end
    player.currentTime = skipTo;
    setCurrentTime(skipTo);
    
    // Hide skip button
    skipIntroOpacity.value = withTiming(0, { duration: 200 });
    setTimeout(() => setShowSkipIntro(false), 200);
    
    showControls();
  }, [player, duration]);

  // Controls visibility
  const showControls = useCallback(() => {
    setControlsVisible(true);
    controlsOpacity.value = withTiming(1, { duration: 200 });

    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }

    if (isPlaying && !settingsOpen) {
      hideControlsTimeout.current = setTimeout(() => {
        controlsOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(setControlsVisible)(false);
      }, 4000);
    }
  }, [isPlaying, settingsOpen]);

  const toggleControls = useCallback(() => {
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
      hideControlsTimeout.current = null;
    }
    
    if (controlsVisible) {
      controlsOpacity.value = withTiming(0, { duration: 150 });
      setControlsVisible(false);
    } else {
      setControlsVisible(true);
      controlsOpacity.value = withTiming(1, { duration: 150 });
      
      if (isPlaying && !settingsOpen) {
        hideControlsTimeout.current = setTimeout(() => {
          controlsOpacity.value = withTiming(0, { duration: 200 });
          runOnJS(setControlsVisible)(false);
        }, 4000);
      }
    }
  }, [controlsVisible, isPlaying, settingsOpen]);

  const controlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const skipIntroStyle = useAnimatedStyle(() => ({
    opacity: skipIntroOpacity.value,
  }));

  // Player controls
  const togglePlayPause = () => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    showControls();
  };

  const seekTo = useCallback((time: number) => {
    if (!player) return;
    const clampedTime = Math.max(0, Math.min(time, duration));
    player.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  }, [player, duration]);

  const seekForward = useCallback((amount: number = SEEK_AMOUNT) => {
    if (!player) return;
    const newTime = Math.min(currentTime + amount, duration);
    player.currentTime = newTime;
    setCurrentTime(newTime);
    showControls();
  }, [player, currentTime, duration, showControls]);

  const seekBackward = useCallback((amount: number = SEEK_AMOUNT) => {
    if (!player) return;
    const newTime = Math.max(currentTime - amount, 0);
    player.currentTime = newTime;
    setCurrentTime(newTime);
    showControls();
  }, [player, currentTime, showControls]);

  // Double-tap seek handler
  const handleDoubleTapSeek = useCallback((side: 'left' | 'right') => {
    if (seekFeedbackTimeout.current) {
      clearTimeout(seekFeedbackTimeout.current);
    }
    
    // Accumulate seek amount for consecutive taps
    consecutiveSeekAmount.current += SEEK_AMOUNT;
    const totalSeek = consecutiveSeekAmount.current;
    
    if (side === 'right') {
      seekForward(SEEK_AMOUNT);
    } else {
      seekBackward(SEEK_AMOUNT);
    }
    
    setSeekFeedback({ side, amount: totalSeek });
    
    // Animate feedback
    seekFeedbackOpacity.value = withTiming(1, { duration: 100 });
    seekFeedbackScale.value = withSequence(
      withSpring(1.2, { damping: 10 }),
      withSpring(1, { damping: 10 })
    );
    
    // Hide feedback after delay
    seekFeedbackTimeout.current = setTimeout(() => {
      seekFeedbackOpacity.value = withTiming(0, { duration: 200 });
      consecutiveSeekAmount.current = 0;
      setSeekFeedback(null);
    }, 800);
  }, [seekForward, seekBackward]);

  // Tap handler for double-tap detection
  const handleTap = useCallback((event: GestureResponderEvent) => {
    if (isLocked) return;
    
    const { locationX } = event.nativeEvent;
    const screenWidth = Dimensions.get('window').width;
    const now = Date.now();
    
    // Check for double tap
    if (
      lastTapRef.current &&
      now - lastTapRef.current.time < DOUBLE_TAP_DELAY &&
      Math.abs(locationX - lastTapRef.current.x) < 100
    ) {
      // Double tap detected
      const side = locationX < screenWidth / 2 ? 'left' : 'right';
      handleDoubleTapSeek(side);
      lastTapRef.current = null;
    } else {
      // Single tap - toggle controls after delay if no second tap
      lastTapRef.current = { time: now, x: locationX };
      setTimeout(() => {
        if (lastTapRef.current && now === lastTapRef.current.time) {
          toggleControls();
          lastTapRef.current = null;
        }
      }, DOUBLE_TAP_DELAY);
    }
  }, [isLocked, handleDoubleTapSeek, toggleControls]);

  const seekFeedbackStyle = useAnimatedStyle(() => ({
    opacity: seekFeedbackOpacity.value,
    transform: [{ scale: seekFeedbackScale.value }],
  }));

  const handleClose = async () => {
    await saveProgress();
    if (!traktStopSentRef.current && currentTimeRef.current > 0) {
      await sendTraktEvent('stop', true);
    }
    if (player) {
      player.pause();
    }
    router.back();
  };

  const toggleLock = () => {
    setIsLocked(!isLocked);
    showControls();
  };

  const handleSettings = () => {
    setSettingsView('root');
    setSettingsOpen(true);
    showControls();
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    setSettingsView('root');
    showControls();
  };

  const openAudioPicker = () => {
    setSettingsView('audio');
  };

  const selectSubtitle = (track: any | null) => {
    if (!player) return;
    try {
      player.subtitleTrack = track;
      setSelectedSubtitleLabel(track?.label || 'Off');
    } catch (e) {
      console.warn('Failed to set subtitle track', e);
    }
  };

  const selectAudio = (track: any | null) => {
    if (!player) return;
    try {
      player.audioTrack = track;
      setSelectedAudioLabel(track?.label || 'Default');
    } catch (e) {
      console.warn('Failed to set audio track', e);
    }
  };

  const handleFullscreen = async () => {
    const current = await ScreenOrientation.getOrientationAsync();
    if (current === ScreenOrientation.Orientation.LANDSCAPE_LEFT) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
    }
    showControls();
  };

  // Progress bar seeking
  const handleProgressBarPress = useCallback((event: GestureResponderEvent) => {
    if (!progressBarRef.current || !duration) return;
    
    const { locationX } = event.nativeEvent;
    const percent = Math.max(0, Math.min(1, locationX / progressBarWidth.current));
    const newTime = percent * duration;
    seekTo(newTime);
    showControls();
  }, [duration, seekTo, showControls]);

  const handleProgressBarLayout = useCallback((event: any) => {
    progressBarWidth.current = event.nativeEvent.layout.width;
  }, []);

  // Progress bar pan responder for scrubbing
  const progressPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        setIsSeeking(true);
        const { locationX } = event.nativeEvent;
        const percent = Math.max(0, Math.min(1, locationX / progressBarWidth.current));
        setSeekPreviewTime(percent * duration);
      },
      onPanResponderMove: (event) => {
        const { locationX } = event.nativeEvent;
        const percent = Math.max(0, Math.min(1, locationX / progressBarWidth.current));
        setSeekPreviewTime(percent * duration);
      },
      onPanResponderRelease: (event) => {
        const { locationX } = event.nativeEvent;
        const percent = Math.max(0, Math.min(1, locationX / progressBarWidth.current));
        const newTime = percent * duration;
        seekTo(newTime);
        setIsSeeking(false);
        setSeekPreviewTime(null);
        showControls();
      },
      onPanResponderTerminate: () => {
        setIsSeeking(false);
        setSeekPreviewTime(null);
      },
    })
  ).current;

  // Volume/Brightness gesture handlers
  const handleVerticalGestureStart = useCallback((event: GestureResponderEvent, side: 'left' | 'right') => {
    if (isLocked) return;
    
    const { pageY } = event.nativeEvent;
    gestureStartY.current = pageY;
    
    if (side === 'left') {
      activeGesture.current = 'brightness';
      gestureStartValue.current = brightness;
    } else {
      activeGesture.current = 'volume';
      gestureStartValue.current = volume;
    }
  }, [isLocked, brightness, volume]);

  const handleVerticalGestureMove = useCallback(async (event: GestureResponderEvent) => {
    if (isLocked || !activeGesture.current) return;
    
    const { pageY } = event.nativeEvent;
    const deltaY = gestureStartY.current - pageY;
    const screenHeight = Dimensions.get('window').height;
    const sensitivity = 1.5; // Adjust for sensitivity
    const change = (deltaY / screenHeight) * sensitivity;
    
    if (activeGesture.current === 'brightness') {
      const newBrightness = Math.max(0.01, Math.min(1, gestureStartValue.current + change));
      setBrightness(newBrightness);
      setShowBrightnessIndicator(true);
      
      // Clear existing timeout
      if (brightnessIndicatorTimeout.current) {
        clearTimeout(brightnessIndicatorTimeout.current);
      }
      
      try {
        await Brightness.setBrightnessAsync(newBrightness);
      } catch (e) {
        // ignore
      }
    } else if (activeGesture.current === 'volume') {
      const newVolume = Math.max(0, Math.min(1, gestureStartValue.current + change));
      setVolume(newVolume);
      setShowVolumeIndicator(true);
      
      // Clear existing timeout
      if (volumeIndicatorTimeout.current) {
        clearTimeout(volumeIndicatorTimeout.current);
      }
      
      // Set player volume - use ref and wrap in try-catch as player may be released
      try {
        const currentPlayer = playerRef.current;
        if (currentPlayer && typeof currentPlayer.volume !== 'undefined') {
          currentPlayer.volume = newVolume;
        }
      } catch (e) {
        // Player may have been released, ignore
      }
    }
  }, [isLocked]);

  const handleVerticalGestureEnd = useCallback(() => {
    activeGesture.current = null;
    
    // Hide indicators after a delay
    if (showBrightnessIndicator) {
      brightnessIndicatorTimeout.current = setTimeout(() => {
        setShowBrightnessIndicator(false);
      }, 1000);
    }
    if (showVolumeIndicator) {
      volumeIndicatorTimeout.current = setTimeout(() => {
        setShowVolumeIndicator(false);
      }, 1000);
    }
  }, [showBrightnessIndicator, showVolumeIndicator]);

  // Left side pan responder (brightness)
  const leftPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only activate for vertical swipes
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 10;
      },
      onPanResponderGrant: (event) => {
        handleVerticalGestureStart(event, 'left');
      },
      onPanResponderMove: (event) => {
        handleVerticalGestureMove(event);
      },
      onPanResponderRelease: () => {
        handleVerticalGestureEnd();
      },
      onPanResponderTerminate: () => {
        handleVerticalGestureEnd();
      },
    })
  ).current;

  // Right side pan responder (volume)
  const rightPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only activate for vertical swipes
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 10;
      },
      onPanResponderGrant: (event) => {
        handleVerticalGestureStart(event, 'right');
      },
      onPanResponderMove: (event) => {
        handleVerticalGestureMove(event);
      },
      onPanResponderRelease: () => {
        handleVerticalGestureEnd();
      },
      onPanResponderTerminate: () => {
        handleVerticalGestureEnd();
      },
    })
  ).current;

  // Playback speed handler
  const cyclePlaybackSpeed = useCallback(() => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackSpeed(newSpeed);
    if (player) {
      player.playbackRate = newSpeed;
    }
    showControls();
  }, [playbackSpeed, player, showControls]);

  // Format time
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Progress percentage - use preview time when seeking
  const displayTime = seekPreviewTime !== null ? seekPreviewTime : currentTime;
  const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0;

  // Next episode handler
  const handleNextEpisode = useCallback(() => {
    if (!nextEpisodeSrc) return;
    
    router.replace({
      pathname: '/player',
      params: {
        videoSrc: nextEpisodeSrc,
        title: nextEpisodeTitle || title,
        imdbId,
        type,
        poster,
        season: nextEpisodeSeason,
        episode: nextEpisodeNumber,
      },
    });
  }, [nextEpisodeSrc, nextEpisodeTitle, title, imdbId, type, poster, nextEpisodeSeason, nextEpisodeNumber]);

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={60} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.errorButton} onPress={handleClose}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Video */}
      {playbackUrl && (
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
        />
      )}

      {/* Tap catcher for gestures */}
      <Pressable 
        style={styles.tapOverlay} 
        onPress={handleTap}
        android_disableSound={true}
      />

      {/* Left side gesture zone (brightness) */}
      <View 
        style={styles.gestureZoneLeft}
        {...leftPanResponder.panHandlers}
      />

      {/* Right side gesture zone (volume) */}
      <View 
        style={styles.gestureZoneRight}
        {...rightPanResponder.panHandlers}
      />

      {/* Brightness indicator */}
      {showBrightnessIndicator && !isInPipMode && (
        <View style={[styles.volumeBrightnessIndicator, styles.brightnessIndicator]}>
          <Ionicons 
            name={brightness > 0.5 ? 'sunny' : 'sunny-outline'} 
            size={24} 
            color="#fff" 
          />
          <View style={styles.indicatorBarContainer}>
            <View style={[styles.indicatorBarFill, { height: `${brightness * 100}%` }]} />
          </View>
          <Text style={styles.indicatorText}>{Math.round(brightness * 100)}%</Text>
        </View>
      )}

      {/* Volume indicator */}
      {showVolumeIndicator && !isInPipMode && (
        <View style={[styles.volumeBrightnessIndicator, styles.volumeIndicator]}>
          <Ionicons 
            name={volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'} 
            size={24} 
            color="#fff" 
          />
          <View style={styles.indicatorBarContainer}>
            <View style={[styles.indicatorBarFill, { height: `${volume * 100}%` }]} />
          </View>
          <Text style={styles.indicatorText}>{Math.round(volume * 100)}%</Text>
        </View>
      )}

      {/* Double-tap seek feedback - Left */}
      {seekFeedback?.side === 'left' && (
        <Animated.View style={[styles.seekFeedback, styles.seekFeedbackLeft, seekFeedbackStyle]}>
          <View style={styles.seekFeedbackInner}>
            <Ionicons name="play-back" size={32} color="#fff" />
            <Text style={styles.seekFeedbackText}>{seekFeedback.amount}s</Text>
          </View>
        </Animated.View>
      )}

      {/* Double-tap seek feedback - Right */}
      {seekFeedback?.side === 'right' && (
        <Animated.View style={[styles.seekFeedback, styles.seekFeedbackRight, seekFeedbackStyle]}>
          <View style={styles.seekFeedbackInner}>
            <Ionicons name="play-forward" size={32} color="#fff" />
            <Text style={styles.seekFeedbackText}>{seekFeedback.amount}s</Text>
          </View>
        </Animated.View>
      )}

      {/* Skip Intro Button */}
      {showSkipIntro && !isLocked && !isInPipMode && (
        <Animated.View style={[styles.skipIntroContainer, skipIntroStyle]}>
          <TouchableOpacity style={styles.skipIntroButton} onPress={handleSkipIntro}>
            <Text style={styles.skipIntroText}>Skip Intro</Text>
            <Ionicons name="play-forward" size={18} color="#000" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Seek preview time */}
      {seekPreviewTime !== null && (
        <View style={styles.seekPreview}>
          <Text style={styles.seekPreviewText}>{formatTime(seekPreviewTime)}</Text>
        </View>
      )}

      {/* Loading Overlay */}
      {(loading || buffering) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>
            {torrentStatus || (buffering ? 'Buffering...' : 'Loading...')}
          </Text>
          {torrentSession && torrentSession.info && (
            <View style={styles.torrentInfo}>
              <Text style={styles.torrentInfoText}>
                {torrentSession.info.name}
              </Text>
              {torrentSession.info.downloadSpeed > 0 && (
                <Text style={styles.torrentSpeedText}>
                  ↓ {(torrentSession.info.downloadSpeed / 1024 / 1024).toFixed(1)} MB/s
                  {' • '}{torrentSession.info.seeds} seeds
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Locked Overlay */}
      {isLocked && controlsVisible && (
        <View style={styles.lockedOverlay}>
          <TouchableOpacity style={styles.unlockButton} onPress={toggleLock}>
            <Ionicons name="lock-closed" size={28} color={Colors.text} />
            <Text style={styles.unlockText}>Tap to unlock</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Next Episode Overlay */}
      {showNextEpisode && nextEpisodeSrc && !loading && !isInPipMode && (
        <Animated.View style={styles.nextEpisodeOverlay}>
          <View style={styles.nextEpisodeCard}>
            <Text style={styles.nextEpisodeLabel}>Up Next</Text>
            <Text style={styles.nextEpisodeTitle} numberOfLines={1}>
              {nextEpisodeTitle || `S${nextEpisodeSeason} E${nextEpisodeNumber}`}
            </Text>
            <View style={styles.nextEpisodeActions}>
              <TouchableOpacity 
                style={styles.nextEpisodeButton} 
                onPress={handleNextEpisode}
              >
                <Ionicons name="play" size={20} color="#000" />
                <Text style={styles.nextEpisodeButtonText}>Play Now</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.nextEpisodeDismiss} 
                onPress={() => setShowNextEpisode(false)}
              >
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Controls Overlay - hide in PiP mode */}
      {!isLocked && !isInPipMode && (
        <Animated.View
          style={[styles.controlsOverlay, controlsStyle]}
          pointerEvents={controlsVisible ? 'box-none' : 'none'}
        >
          {/* Top Bar */}
          <View style={[styles.topBar, { paddingTop: insets.top || Spacing.lg }]}>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="chevron-down" size={28} color={Colors.text} />
            </TouchableOpacity>
            <View style={styles.titleContainer}>
              <Text style={styles.videoTitle} numberOfLines={1}>
                {title || 'Playing Video'}
              </Text>
              {season && episode && (
                <Text style={styles.episodeInfo}>
                  S{season} E{episode}
                </Text>
              )}
            </View>
            <View style={{ width: 44 }} />
          </View>

          {/* Center Controls */}
          <View style={styles.centerControls}>
            <TouchableOpacity style={styles.seekButton} onPress={() => seekBackward()}>
              <Ionicons name="play-back" size={32} color={Colors.text} />
              <Text style={styles.seekText}>10</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.playButton} onPress={togglePlayPause}>
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={48}
                color={Colors.text}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.seekButton} onPress={() => seekForward()}>
              <Ionicons name="play-forward" size={32} color={Colors.text} />
              <Text style={styles.seekText}>10</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Bar */}
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom || Spacing.lg }]}>
            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <Text style={styles.timeText}>{formatTime(displayTime)}</Text>
              <View 
                style={styles.progressBarContainer}
                ref={progressBarRef}
                onLayout={handleProgressBarLayout}
                {...progressPanResponder.panHandlers}
              >
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                  {/* Scrubber handle */}
                  <View 
                    style={[
                      styles.progressBarHandle, 
                      { left: `${progressPercent}%` },
                      isSeeking && styles.progressBarHandleActive
                    ]} 
                  />
                </View>
              </View>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>

            {/* Bottom Actions */}
            <View style={styles.bottomActions}>
              <TouchableOpacity style={styles.actionButton} onPress={toggleLock}>
                <Ionicons name={isLocked ? 'lock-closed-outline' : 'lock-open-outline'} size={22} color={Colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={handleSettings}>
                <Ionicons name="settings-outline" size={22} color={Colors.text} />
              </TouchableOpacity>
              {nextEpisodeSrc && (
                <TouchableOpacity style={styles.actionButton} onPress={handleNextEpisode}>
                  <Ionicons name="play-skip-forward-outline" size={22} color={Colors.text} />
                </TouchableOpacity>
              )}
              {isPipSupported && (
                <TouchableOpacity style={styles.actionButton} onPress={enterPipMode}>
                  <Ionicons name="tablet-landscape-outline" size={22} color={Colors.text} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionButton} onPress={handleFullscreen}>
                <Ionicons name="expand-outline" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Settings Sheet */}
      {settingsOpen && !isLocked && (
        <View style={styles.settingsOverlay} pointerEvents="auto">
          <Pressable style={styles.settingsBackdrop} onPress={closeSettings} />
          <View style={[styles.settingsSheet, { paddingBottom: insets.bottom || Spacing.lg }]}> 
            <View style={styles.settingsHeader}>
              <TouchableOpacity
                style={styles.settingsBack}
                onPress={() => {
                  if (settingsView === 'root') {
                    closeSettings();
                  } else {
                    setSettingsView('root');
                  }
                }}
              >
                <Ionicons name="chevron-back" size={22} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.settingsTitle}>
                {settingsView === 'root'
                  ? 'Settings'
                  : settingsView === 'subtitles'
                    ? 'Subtitles'
                    : settingsView === 'audio'
                      ? 'Audio Track'
                      : 'Playback Speed'}
              </Text>
              <View style={{ width: 32 }} />
            </View>

            {settingsView === 'root' && (
              <View style={styles.settingsList}>
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setSettingsView('subtitles')}
                >
                  <Text style={styles.settingsRowLabel}>Subtitles</Text>
                  <Text style={styles.settingsRowValue}>{selectedSubtitleLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={openAudioPicker}
                >
                  <Text style={styles.settingsRowLabel}>Audio Track</Text>
                  <Text style={styles.settingsRowValue}>{selectedAudioLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setSettingsView('speed')}
                >
                  <Text style={styles.settingsRowLabel}>Playback Speed</Text>
                  <Text style={styles.settingsRowValue}>{playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`}</Text>
                </TouchableOpacity>
              </View>
            )}

            {settingsView === 'subtitles' && (
              <View style={styles.settingsList}>
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => selectSubtitle(null)}
                >
                  <Text style={styles.settingsRowLabel}>Off</Text>
                  {selectedSubtitleLabel === 'Off' && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
                {availableSubtitleTracks.length === 0 ? (
                  <View style={styles.settingsEmpty}>
                    <Text style={styles.settingsEmptyText}>No subtitles available</Text>
                  </View>
                ) : (
                  availableSubtitleTracks.map((t: any, idx: number) => (
                    <TouchableOpacity
                      key={t?.id || `${t?.language || 'sub'}_${idx}`}
                      style={styles.settingsRow}
                      onPress={() => selectSubtitle(t)}
                    >
                      <Text style={styles.settingsRowLabel}>{t?.label || t?.language || `Subtitle ${idx + 1}`}</Text>
                      {selectedSubtitleLabel === (t?.label || t?.language) && (
                        <Ionicons name="checkmark" size={20} color={Colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {settingsView === 'audio' && (
              <View style={styles.settingsList}>
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => selectAudio(null)}
                >
                  <Text style={styles.settingsRowLabel}>Default</Text>
                  {selectedAudioLabel === 'Default' && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
                {availableAudioTracks.length === 0 ? (
                  <View style={styles.settingsEmpty}>
                    <Text style={styles.settingsEmptyText}>No alternate audio tracks</Text>
                  </View>
                ) : (
                  availableAudioTracks.map((t: any, idx: number) => (
                    <TouchableOpacity
                      key={t?.id || `${t?.language || 'aud'}_${idx}`}
                      style={styles.settingsRow}
                      onPress={() => selectAudio(t)}
                    >
                      <Text style={styles.settingsRowLabel}>{t?.label || t?.language || `Audio ${idx + 1}`}</Text>
                      {selectedAudioLabel === (t?.label || t?.language) && (
                        <Ionicons name="checkmark" size={20} color={Colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {settingsView === 'speed' && (
              <View style={styles.settingsList}>
                {PLAYBACK_SPEEDS.map((speed) => (
                  <TouchableOpacity
                    key={speed}
                    style={styles.settingsRow}
                    onPress={() => {
                      setPlaybackSpeed(speed);
                      if (player) {
                        player.playbackRate = speed;
                      }
                      setSettingsView('root');
                    }}
                  >
                    <Text style={styles.settingsRowLabel}>
                      {speed === 1 ? 'Normal' : `${speed}x`}
                    </Text>
                    {playbackSpeed === speed && (
                      <Ionicons name="checkmark" size={20} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  tapOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  // Gesture zones for volume/brightness
  gestureZoneLeft: {
    position: 'absolute',
    left: 0,
    top: '20%',
    bottom: '20%',
    width: '15%',
    zIndex: 2,
  },
  gestureZoneRight: {
    position: 'absolute',
    right: 0,
    top: '20%',
    bottom: '20%',
    width: '15%',
    zIndex: 2,
  },
  // Volume/Brightness indicators
  volumeBrightnessIndicator: {
    position: 'absolute',
    top: '30%',
    bottom: '30%',
    width: 50,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    zIndex: 10,
  },
  brightnessIndicator: {
    left: 30,
  },
  volumeIndicator: {
    right: 30,
  },
  indicatorBarContainer: {
    width: 6,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
    marginVertical: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  indicatorBarFill: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 3,
  },
  indicatorText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Seek feedback styles
  seekFeedback: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '40%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  seekFeedbackLeft: {
    left: 0,
  },
  seekFeedbackRight: {
    right: 0,
  },
  seekFeedbackInner: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 50,
    padding: 20,
    alignItems: 'center',
  },
  seekFeedbackText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  // Skip intro button
  skipIntroContainer: {
    position: 'absolute',
    right: Spacing.xl,
    bottom: 120,
    zIndex: 6,
  },
  skipIntroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#fff',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
  },
  skipIntroText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    color: '#000',
  },
  // Seek preview
  seekPreview: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 6,
  },
  seekPreviewText: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  // Settings overlay
  settingsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    justifyContent: 'flex-end',
  },
  settingsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  settingsSheet: {
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.md,
  },
  settingsBack: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  settingsList: {
    paddingBottom: Spacing.lg,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  settingsRowLabel: {
    fontSize: Typography.sizes.md,
    color: Colors.text,
  },
  settingsRowValue: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginLeft: Spacing.md,
  },
  settingsEmpty: {
    paddingVertical: Spacing.md,
  },
  settingsEmptyText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 3,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.glass,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  videoTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  episodeInfo: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xxxl,
  },
  seekButton: {
    alignItems: 'center',
    padding: Spacing.md,
  },
  seekText: {
    fontSize: Typography.sizes.xs,
    color: Colors.text,
    marginTop: 2,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.glassStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBar: {
    paddingHorizontal: Spacing.lg,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  timeText: {
    fontSize: Typography.sizes.sm,
    color: Colors.text,
    minWidth: 50,
  },
  progressBarContainer: {
    flex: 1,
    height: 24, // Larger touch target
    justifyContent: 'center',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'visible',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  progressBarHandle: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    marginLeft: -8,
    opacity: 0,
  },
  progressBarHandleActive: {
    opacity: 1,
    transform: [{ scale: 1.2 }],
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.lg,
  },
  actionButton: {
    padding: Spacing.sm,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  errorText: {
    fontSize: Typography.sizes.lg,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  errorButton: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.card,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  errorButtonText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 5,
  },
  unlockButton: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  unlockText: {
    marginTop: Spacing.sm,
    fontSize: Typography.sizes.md,
    color: Colors.text,
  },
  torrentInfo: {
    marginTop: Spacing.lg,
    alignItems: 'center',
    maxWidth: '80%',
  },
  torrentInfoText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  torrentSpeedText: {
    fontSize: Typography.sizes.xs,
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
  // Next episode overlay
  nextEpisodeOverlay: {
    position: 'absolute',
    right: Spacing.xl,
    bottom: 100,
    zIndex: 4,
  },
  nextEpisodeCard: {
    backgroundColor: 'rgba(30,30,30,0.95)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    minWidth: 200,
  },
  nextEpisodeLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  nextEpisodeTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  nextEpisodeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  nextEpisodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#fff',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
  },
  nextEpisodeButtonText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: '#000',
  },
  nextEpisodeDismiss: {
    padding: Spacing.sm,
  },
});
