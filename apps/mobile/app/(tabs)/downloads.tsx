import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { DownloadItem, useDownloadsStore } from '@/lib/stores/downloadsStore';

export default function DownloadsScreen() {
  const {
    downloads,
    loading,
    loadDownloads,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    removeDownload,
    clearCompletedDownloads,
  } = useDownloadsStore();

  useEffect(() => {
    loadDownloads();
  }, [loadDownloads]);

  const handlePlayDownload = useCallback((item: DownloadItem) => {
    if (item.status !== 'completed' || !item.localPath) {
      Alert.alert('Not Ready', 'This download is not yet complete.');
      return;
    }

    router.push({
      pathname: '/player',
      params: {
        videoSrc: item.localPath,
        title: item.title,
        imdbId: item.imdbId,
        type: item.type,
        poster: item.poster,
        season: item.season?.toString() || '',
        episode: item.episode?.toString() || '',
      },
    });
  }, []);

  const handlePauseResume = useCallback((item: DownloadItem) => {
    if (item.status === 'downloading') {
      pauseDownload(item.id);
    } else if (item.status === 'paused' || item.status === 'error') {
      resumeDownload(item.id);
    }
  }, [pauseDownload, resumeDownload]);

  const handleDelete = useCallback((item: DownloadItem) => {
    Alert.alert(
      'Delete Download',
      `Are you sure you want to delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (item.status === 'downloading') {
              cancelDownload(item.id);
            } else {
              removeDownload(item.id);
            }
          },
        },
      ]
    );
  }, [cancelDownload, removeDownload]);

  const handleClearCompleted = useCallback(() => {
    const completedCount = downloads.filter((d) => d.status === 'completed').length;
    if (completedCount === 0) return;

    Alert.alert(
      'Clear Completed',
      `Delete ${completedCount} completed download${completedCount > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: clearCompletedDownloads,
        },
      ]
    );
  }, [downloads, clearCompletedDownloads]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const renderDownloadItem = ({ item }: { item: DownloadItem }) => {
    const isDownloading = item.status === 'downloading';
    const isPaused = item.status === 'paused';
    const isCompleted = item.status === 'completed';
    const isError = item.status === 'error';
    const isPending = item.status === 'pending';

    return (
      <TouchableOpacity
        style={styles.downloadCard}
        activeOpacity={isCompleted ? 0.7 : 1}
        onPress={() => isCompleted && handlePlayDownload(item)}
      >
        {/* Poster */}
        <View style={styles.posterContainer}>
          {item.poster ? (
            <Image source={{ uri: item.poster }} style={styles.poster} resizeMode="cover" />
          ) : (
            <View style={styles.posterPlaceholder}>
              <Ionicons name="film-outline" size={28} color={Colors.textMuted} />
            </View>
          )}
          {isCompleted && (
            <View style={styles.playOverlay}>
              <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.9)" />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.downloadInfo}>
          <Text style={styles.downloadTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.type === 'series' && item.season !== undefined && item.episode !== undefined && (
            <Text style={styles.downloadMeta}>
              S{item.season} E{item.episode}
              {item.episodeTitle ? ` • ${item.episodeTitle}` : ''}
            </Text>
          )}

          {/* Status */}
          <View style={styles.statusRow}>
            {isPending && (
              <Text style={styles.statusText}>Waiting...</Text>
            )}
            {isDownloading && (
              <>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${item.progress}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {item.progress}% • {formatBytes(item.downloadedBytes)} / {formatBytes(item.totalBytes)}
                </Text>
              </>
            )}
            {isPaused && (
              <>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, styles.progressBarPaused, { width: `${item.progress}%` }]} />
                </View>
                <Text style={styles.statusText}>Paused • {item.progress}%</Text>
              </>
            )}
            {isCompleted && (
              <Text style={styles.completedText}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} /> Ready to watch
              </Text>
            )}
            {isError && (
              <Text style={styles.errorText}>
                <Ionicons name="alert-circle" size={14} color={Colors.error} /> {item.error || 'Download failed'}
              </Text>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.downloadActions}>
          {(isDownloading || isPaused || isError) && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handlePauseResume(item)}
            >
              <Ionicons
                name={isDownloading ? 'pause' : 'play'}
                size={20}
                color={Colors.text}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const completedCount = downloads.filter((d) => d.status === 'completed').length;
  const activeCount = downloads.filter((d) => d.status === 'downloading').length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Downloads</Text>
        {completedCount > 0 && (
          <TouchableOpacity onPress={handleClearCompleted}>
            <Text style={styles.clearButton}>Clear Completed</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats */}
      {downloads.length > 0 && (
        <View style={styles.statsRow}>
          {activeCount > 0 && (
            <View style={styles.statBadge}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.statText}>{activeCount} downloading</Text>
            </View>
          )}
          {completedCount > 0 && (
            <View style={styles.statBadge}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.statText}>{completedCount} ready</Text>
            </View>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={downloads}
          renderItem={renderDownloadItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={downloads.length === 0 ? styles.emptyList : styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="download-outline" size={80} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Downloads</Text>
              <Text style={styles.emptySubtext}>
                Download movies and shows to watch offline.{'\n'}
                Look for the download button on the stream selection.
              </Text>
            </View>
          }
        />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  headerTitle: {
    fontSize: Typography.sizes.hero,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
  },
  clearButton: {
    fontSize: Typography.sizes.sm,
    color: Colors.primary,
    fontWeight: Typography.weights.semibold,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  statText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  emptyTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
    marginTop: Spacing.lg,
  },
  emptySubtext: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  downloadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  posterContainer: {
    width: 80,
    height: 120,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  downloadInfo: {
    flex: 1,
    gap: 4,
  },
  downloadTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
  },
  downloadMeta: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  statusRow: {
    marginTop: Spacing.sm,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginBottom: Spacing.xs,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  progressBarPaused: {
    backgroundColor: Colors.textMuted,
  },
  progressText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
  },
  statusText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  completedText: {
    fontSize: Typography.sizes.sm,
    color: Colors.success,
  },
  errorText: {
    fontSize: Typography.sizes.sm,
    color: Colors.error,
  },
  downloadActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
