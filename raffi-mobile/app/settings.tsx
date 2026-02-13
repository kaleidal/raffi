import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { clearMetaCache } from '@/lib/api';
import { signInWithTrakt } from '@/lib/auth/traktAuth';
import { disconnectTrakt, getTraktStatus, type TraktStatus } from '@/lib/db';
import { useAuthStore } from '@/lib/stores/authStore';
import { useLibraryStore } from '@/lib/stores/libraryStore';

// Settings keys
const SETTINGS_KEYS = {
  AUTO_PLAY_NEXT: 'settings_auto_play_next',
  AUTO_SKIP_INTRO: 'settings_auto_skip_intro',
  HD_ONLY: 'settings_hd_only',
  PREFER_DEBRID: 'settings_prefer_debrid',
  SAVE_WATCH_HISTORY: 'settings_save_watch_history',
};

interface SettingsState {
  autoPlayNext: boolean;
  autoSkipIntro: boolean;
  hdOnly: boolean;
  preferDebrid: boolean;
  saveWatchHistory: boolean;
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState<SettingsState>({
    autoPlayNext: true,
    autoSkipIntro: false,
    hdOnly: false,
    preferDebrid: true,
    saveWatchHistory: true,
  });
  const [loading, setLoading] = useState(true);
  const [traktStatus, setTraktStatus] = useState<TraktStatus | null>(null);
  const [traktLoading, setTraktLoading] = useState(false);
  const [traktBusy, setTraktBusy] = useState(false);
  const { clearLibrary } = useLibraryStore();
  const { user } = useAuthStore();

  const loadTraktStatus = async () => {
    if (!user) {
      setTraktStatus(null);
      return;
    }
    setTraktLoading(true);
    try {
      const status = await getTraktStatus();
      setTraktStatus(status);
    } catch (e) {
      console.error('Failed to load Trakt status:', e);
      setTraktStatus(null);
    } finally {
      setTraktLoading(false);
    }
  };

  // Load settings from storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [
          autoPlayNext,
          autoSkipIntro,
          hdOnly,
          preferDebrid,
          saveWatchHistory,
        ] = await Promise.all([
          AsyncStorage.getItem(SETTINGS_KEYS.AUTO_PLAY_NEXT),
          AsyncStorage.getItem(SETTINGS_KEYS.AUTO_SKIP_INTRO),
          AsyncStorage.getItem(SETTINGS_KEYS.HD_ONLY),
          AsyncStorage.getItem(SETTINGS_KEYS.PREFER_DEBRID),
          AsyncStorage.getItem(SETTINGS_KEYS.SAVE_WATCH_HISTORY),
        ]);

        setSettings({
          autoPlayNext: autoPlayNext !== 'false',
          autoSkipIntro: autoSkipIntro === 'true',
          hdOnly: hdOnly === 'true',
          preferDebrid: preferDebrid !== 'false',
          saveWatchHistory: saveWatchHistory !== 'false',
        });
      } catch (e) {
        console.error('Failed to load settings:', e);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    loadTraktStatus();
  }, [user]);

  // Save setting helper
  const updateSetting = async (key: string, value: boolean) => {
    try {
      await AsyncStorage.setItem(key, value.toString());
    } catch (e) {
      console.error('Failed to save setting:', e);
    }
  };

  const toggleAutoPlayNext = () => {
    const newValue = !settings.autoPlayNext;
    setSettings((prev) => ({ ...prev, autoPlayNext: newValue }));
    updateSetting(SETTINGS_KEYS.AUTO_PLAY_NEXT, newValue);
  };

  const toggleAutoSkipIntro = () => {
    const newValue = !settings.autoSkipIntro;
    setSettings((prev) => ({ ...prev, autoSkipIntro: newValue }));
    updateSetting(SETTINGS_KEYS.AUTO_SKIP_INTRO, newValue);
  };

  const toggleHdOnly = () => {
    const newValue = !settings.hdOnly;
    setSettings((prev) => ({ ...prev, hdOnly: newValue }));
    updateSetting(SETTINGS_KEYS.HD_ONLY, newValue);
  };

  const togglePreferDebrid = () => {
    const newValue = !settings.preferDebrid;
    setSettings((prev) => ({ ...prev, preferDebrid: newValue }));
    updateSetting(SETTINGS_KEYS.PREFER_DEBRID, newValue);
  };

  const toggleSaveWatchHistory = () => {
    const newValue = !settings.saveWatchHistory;
    setSettings((prev) => ({ ...prev, saveWatchHistory: newValue }));
    updateSetting(SETTINGS_KEYS.SAVE_WATCH_HISTORY, newValue);
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all cached metadata. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearMetaCache();
            Alert.alert('Success', 'Cache cleared successfully');
          },
        },
      ]
    );
  };

  const handleClearWatchHistory = () => {
    Alert.alert(
      'Clear Watch History',
      'This will remove all your watch progress. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearLibrary();
              Alert.alert('Success', 'Watch history cleared');
            } catch (e) {
              Alert.alert('Error', 'Failed to clear watch history');
            }
          },
        },
      ]
    );
  };

  const handleConnectTrakt = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in with Ave first.');
      return;
    }

    setTraktBusy(true);
    try {
      const status = await signInWithTrakt();
      setTraktStatus(status);
      Alert.alert('Connected', `Trakt connected${status.username ? ` as ${status.username}` : ''}.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to connect Trakt');
    } finally {
      setTraktBusy(false);
    }
  };

  const handleDisconnectTrakt = async () => {
    setTraktBusy(true);
    try {
      await disconnectTrakt();
      setTraktStatus((prev) =>
        prev ? { ...prev, connected: false, username: null, slug: null } : prev
      );
      Alert.alert('Disconnected', 'Trakt has been disconnected.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to disconnect Trakt');
    } finally {
      setTraktBusy(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.authGateContainer}>
          <Text style={styles.authGateTitle}>Sign in required</Text>
          <Text style={styles.authGateDescription}>
            Sign in with Ave to access settings and sync across devices.
          </Text>
          <TouchableOpacity style={styles.authGateButton} onPress={() => router.push('/login')}>
            <Text style={styles.authGateButtonText}>Continue with Ave</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Playback Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Playback</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto-play next episode</Text>
              <Text style={styles.settingDescription}>
                Automatically play the next episode when one ends
              </Text>
            </View>
            <Switch
              value={settings.autoPlayNext}
              onValueChange={toggleAutoPlayNext}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto-skip intro</Text>
              <Text style={styles.settingDescription}>
                Automatically skip intros when detected
              </Text>
            </View>
            <Switch
              value={settings.autoSkipIntro}
              onValueChange={toggleAutoSkipIntro}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
        </View>

        {/* Stream Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stream Preferences</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>HD only</Text>
              <Text style={styles.settingDescription}>
                Only show streams that are 720p or higher
              </Text>
            </View>
            <Switch
              value={settings.hdOnly}
              onValueChange={toggleHdOnly}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Prefer debrid streams</Text>
              <Text style={styles.settingDescription}>
                Prioritize Real-Debrid, AllDebrid, and Premiumize streams
              </Text>
            </View>
            <Switch
              value={settings.preferDebrid}
              onValueChange={togglePreferDebrid}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
        </View>

        {/* Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Save watch history</Text>
              <Text style={styles.settingDescription}>
                Keep track of what you&apos;ve watched
              </Text>
            </View>
            <Switch
              value={settings.saveWatchHistory}
              onValueChange={toggleSaveWatchHistory}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
        </View>

        {/* Integrations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Integrations</Text>

          <View style={styles.integrationCard}>
            <View style={styles.integrationInfo}>
              <Text style={styles.settingLabel}>Trakt</Text>
              <Text style={styles.settingDescription}>
                Sync start, pause, and stop watch activity to your Trakt profile
              </Text>
              {traktStatus?.connected && (
                <Text style={styles.integrationConnectedText}>
                  Connected as {traktStatus.username || traktStatus.slug || 'Trakt user'}
                </Text>
              )}
              {!traktLoading && traktStatus && !traktStatus.configured && (
                <Text style={styles.integrationDisabledText}>
                  Trakt is not configured in this build
                </Text>
              )}
            </View>

            {traktLoading ? (
              <ActivityIndicator color={Colors.primary} />
            ) : traktStatus?.connected ? (
              <TouchableOpacity
                style={[styles.integrationButton, styles.integrationDisconnectButton, traktBusy && styles.integrationButtonDisabled]}
                onPress={handleDisconnectTrakt}
                disabled={traktBusy}
              >
                <Text style={styles.integrationDisconnectText}>
                  {traktBusy ? 'Disconnecting...' : 'Disconnect'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.integrationButton, traktBusy && styles.integrationButtonDisabled]}
                onPress={handleConnectTrakt}
                disabled={traktBusy || !!traktStatus && !traktStatus.configured}
              >
                <Text style={styles.integrationButtonText}>
                  {traktBusy ? 'Connecting...' : 'Connect'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Storage */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage</Text>

          <TouchableOpacity style={styles.actionRow} onPress={handleClearCache}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Clear cache</Text>
              <Text style={styles.settingDescription}>
                Free up space by clearing cached metadata
              </Text>
            </View>
            <Ionicons name="trash-outline" size={22} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionRow} onPress={handleClearWatchHistory}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Clear watch history</Text>
              <Text style={styles.settingDescription}>
                Remove all watch progress data
              </Text>
            </View>
            <Ionicons name="trash-outline" size={22} color={Colors.error} />
          </TouchableOpacity>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Build</Text>
            <Text style={styles.infoValue}>Mobile</Text>
          </View>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
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
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  sectionTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.lg,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  settingInfo: {
    flex: 1,
    marginRight: Spacing.lg,
  },
  settingLabel: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.medium,
    color: Colors.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  infoLabel: {
    fontSize: Typography.sizes.md,
    color: Colors.text,
  },
  infoValue: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
  },
  integrationCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  integrationInfo: {
    flex: 1,
    gap: 4,
  },
  integrationConnectedText: {
    fontSize: Typography.sizes.sm,
    color: Colors.success,
    marginTop: 2,
  },
  integrationDisabledText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  integrationButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  integrationButtonDisabled: {
    opacity: 0.6,
  },
  integrationButtonText: {
    color: '#000',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  integrationDisconnectButton: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  integrationDisconnectText: {
    color: Colors.text,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  authGateContainer: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authGateTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
  },
  authGateDescription: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
    maxWidth: 320,
  },
  authGateButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  authGateButtonText: {
    color: '#000',
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
  },
});
