import { Ionicons } from '@expo/vector-icons';
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
    View
} from 'react-native';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { getLibraryItem } from '@/lib/db';
import { useLibraryStore } from '@/lib/stores/libraryStore';
import TorrentStreamer, { StreamSession } from '@/lib/torrent/TorrentStreamer';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [torrentSession, setTorrentSession] = useState<StreamSession | null>(null);
  const torrentSessionRef = useRef<StreamSession | null>(null); // Ref for cleanup
  const [torrentStatus, setTorrentStatus] = useState<string>('');
  const [isLocked, setIsLocked] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<'root' | 'subtitles' | 'audio'>('root');
  const [availableSubtitleTracks, setAvailableSubtitleTracks] = useState<any[]>([]);
  const [availableAudioTracks, setAvailableAudioTracks] = useState<any[]>([]);
  const [selectedSubtitleLabel, setSelectedSubtitleLabel] = useState<string>('Off');
  const [selectedAudioLabel, setSelectedAudioLabel] = useState<string>('Default');

  const controlsOpacity = useSharedValue(1);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressSaveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedTime = useRef(0);

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
          
          // Check if native module is available
          if (!TorrentStreamer.isAvailable()) {
            setError(
              Platform.OS === 'ios'
                ? 'Torrent streaming on iOS is coming soon. Please use a debrid service (Real-Debrid, AllDebrid, Premiumize) for instant playback.'
                : 'Torrent streaming requires a development build. Please rebuild the app with native modules enabled, or use a debrid service for instant playback.'
            );
            setLoading(false);
            return;
          }
          
          // Start torrent stream
          const session = await TorrentStreamer.startStream(
            videoSrc,
            fileIdx ? parseInt(fileIdx) : undefined
          );
          
          setTorrentSession(session);
          torrentSessionRef.current = session; // Keep ref for cleanup
          
          if (session.status === 'error') {
            setError(session.error || 'Failed to start torrent stream');
            setLoading(false);
            return;
          }
          
          // Subscribe to session updates
          const unsubscribe = TorrentStreamer.subscribe(session.id, (updatedSession) => {
            setTorrentSession(updatedSession);
            console.log('Torrent session update:', updatedSession.status, updatedSession.bufferProgress, updatedSession.streamUrl);
            
            if (updatedSession.status === 'downloading_metadata') {
              setTorrentStatus('Fetching torrent metadata...');
            } else if (updatedSession.status === 'buffering') {
              setTorrentStatus(`Buffering: ${updatedSession.bufferProgress.toFixed(1)}%`);
            } else if (updatedSession.status === 'ready') {
              console.log('Stream ready! Setting playback URL:', updatedSession.streamUrl);
              setPlaybackUrl(updatedSession.streamUrl);
              setTorrentStatus('');
              setLoading(false);
            } else if (updatedSession.status === 'error') {
              setError(updatedSession.error || 'Torrent streaming error');
              setLoading(false);
            }
          });

          // Ensure we unsubscribe on unmount
          return () => {
            unsubscribe?.();
          };
          
        }

        // For local files, try to play directly
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

    // Cleanup torrent session + subscription on unmount
    return () => {
      cleanupSubscription?.();
      if (torrentSessionRef.current) {
        console.log('Stopping torrent stream:', torrentSessionRef.current.id);
        TorrentStreamer.stopStream(torrentSessionRef.current.id);
        torrentSessionRef.current = null;
      }
    };
  }, [videoSrc, fileIdx, startTimeParam]);

  // Create video player - only use non-empty URL
  // When playbackUrl is null/empty, use a placeholder that won't trigger an error
  const player = useVideoPlayer(playbackUrl || null, (player) => {
    player.loop = false;
    // Initial seek is performed on readyToPlay for reliability.
  });

  // Subscribe to player events
  useEffect(() => {
    if (!player) return;

    const statusSubscription = player.addListener('statusChange', (payload) => {
      const status = payload.status;
      if (status === 'readyToPlay') {
        setLoading(false);
        setDuration(player.duration);

        // Robust initial seek (expo-video may ignore currentTime set too early)
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
        // Only show loading if we actually have a URL to load
        if (playbackUrl) {
          setLoading(true);
        }
      } else if (status === 'error') {
        // Only show error if we have a URL - empty/null URL errors are expected
        if (playbackUrl) {
          console.error('Video player error for URL:', playbackUrl);
          setError('Failed to play video');
          setLoading(false);
        }
      }
    });

    const playingSubscription = player.addListener('playingChange', (payload) => {
      setIsPlaying(payload.isPlaying);
    });

    const sourceLoadSubscription = player.addListener('sourceLoad', (payload: any) => {
      // Keep local state in sync with expo-video track discovery.
      // These properties do not automatically update React state.
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
  }, [player]);

  // Update current time periodically
  useEffect(() => {
    if (!player) return;

    const interval = setInterval(() => {
      if (!isSeeking && player.currentTime !== undefined) {
        setCurrentTime(player.currentTime);
        setDuration(player.duration || 0);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [player, isSeeking]);

  // Lock to landscape on mount
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    StatusBar.setHidden(true);

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      StatusBar.setHidden(false);
    };
  }, []);

  // Save progress periodically
  useEffect(() => {
    if (!imdbId || !type) return;

    // Seed series progress base once (prevents overwriting other episodes)
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
    }, 10000); // Save every 10 seconds

    return () => {
      if (progressSaveInterval.current) {
        clearInterval(progressSaveInterval.current);
      }
      // Save on unmount
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

  // Controls visibility
  const showControls = useCallback(() => {
    setControlsVisible(true);
    controlsOpacity.value = withTiming(1, { duration: 200 });

    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }

    if (isPlaying) {
      hideControlsTimeout.current = setTimeout(() => {
        controlsOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(setControlsVisible)(false);
      }, 4000);
    }
  }, [isPlaying]);

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
      
      // Auto-hide after 4 seconds if playing
      if (isPlaying) {
        hideControlsTimeout.current = setTimeout(() => {
          controlsOpacity.value = withTiming(0, { duration: 200 });
          runOnJS(setControlsVisible)(false);
        }, 4000);
      }
    }
  }, [controlsVisible, isPlaying]);

  const controlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
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

  const seekForward = () => {
    if (!player) return;
    const newTime = Math.min(currentTime + 10, duration);
    player.currentTime = newTime;
    setCurrentTime(newTime);
    showControls();
  };

  const seekBackward = () => {
    if (!player) return;
    const newTime = Math.max(currentTime - 10, 0);
    player.currentTime = newTime;
    setCurrentTime(newTime);
    showControls();
  };

  const handleClose = async () => {
    await saveProgress();
    if (player) {
      player.pause();
    }
    router.back();
  };

  const toggleLock = () => {
    setIsLocked(!isLocked);
    showControls();
  };

  const handleSubtitles = () => {
    setSettingsView('subtitles');
    setSettingsOpen(true);
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
    // Toggle between landscape orientations
    const current = await ScreenOrientation.getOrientationAsync();
    if (current === ScreenOrientation.Orientation.LANDSCAPE_LEFT) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
    }
    showControls();
  };

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

  // Progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

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

      {/* Tap catcher (VideoView can swallow touches) */}
      <Pressable 
        style={styles.tapOverlay} 
        onPress={toggleControls}
        android_disableSound={true}
      />

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>
            {torrentStatus || 'Loading...'}
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

      {/* Locked Overlay - only show unlock button when locked */}
      {isLocked && controlsVisible && (
        <View style={styles.lockedOverlay}>
          <TouchableOpacity style={styles.unlockButton} onPress={toggleLock}>
            <Ionicons name="lock-closed" size={28} color={Colors.text} />
            <Text style={styles.unlockText}>Tap to unlock</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Controls Overlay */}
      {!isLocked && (
      <Animated.View
        style={[styles.controlsOverlay, controlsStyle]}
        // Allow the background area of the overlay to pass taps through to `tapOverlay`,
        // while still keeping buttons interactive.
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
          <TouchableOpacity style={styles.seekButton} onPress={seekBackward}>
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

          <TouchableOpacity style={styles.seekButton} onPress={seekForward}>
            <Ionicons name="play-forward" size={32} color={Colors.text} />
            <Text style={styles.seekText}>10</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Bar */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom || Spacing.lg }]}>
          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
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
                    : 'Audio Track'}
              </Text>
              <View style={{ width: 32 }} />
            </View>

            {settingsView === 'root' && (
              <View style={styles.settingsList}>
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => {
                    setSettingsView('subtitles');
                  }}
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
              </View>
            )}

            {settingsView === 'subtitles' && (
              <View style={styles.settingsList}>
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => selectSubtitle(null)}
                >
                  <Text style={styles.settingsRowLabel}>Off</Text>
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
                    </TouchableOpacity>
                  ))
                )}
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
    height: 4,
  },
  progressBarBg: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
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
});
