import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { useAddonsStore } from '@/lib/stores/addonsStore';
import type { Addon } from '@/lib/types';

export default function AddonsScreen() {
  const { addons, loading, error, fetchAddons, installAddon, removeAddon, clearError } = useAddonsStore();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [addonUrl, setAddonUrl] = useState('');
  const [installing, setInstalling] = useState(false);

  const PopularAddons = (
    <View style={styles.popularSection}>
      <Text style={styles.sectionTitle}>Popular Addons</Text>
      <TouchableOpacity
        style={styles.popularAddon}
        onPress={() => {
          setAddonUrl('https://torrentio.strem.fun');
          setShowInstallModal(true);
        }}
      >
        <View style={styles.popularIcon}>
          <Ionicons name="cloud-download" size={24} color={Colors.primary} />
        </View>
        <View style={styles.popularInfo}>
          <Text style={styles.popularName}>Torrentio</Text>
          <Text style={styles.popularDescription}>Torrent streams from various sources</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  useEffect(() => {
    fetchAddons();
  }, [fetchAddons]);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error, clearError]);

  const handleInstallAddon = async () => {
    if (!addonUrl.trim()) return;

    setInstalling(true);
    try {
      // Parse the addon manifest from the URL
      let manifestUrl = addonUrl.trim();
      if (!manifestUrl.endsWith('/manifest.json')) {
        manifestUrl = manifestUrl.replace(/\/$/, '') + '/manifest.json';
      }

      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch addon manifest');
      }

      const manifest = await response.json();
      const transportUrl = addonUrl.replace(/\/manifest\.json$/, '').replace(/\/$/, '');
      
      await installAddon({
        addon_id: manifest.id,
        transport_url: transportUrl,
        manifest: {
          id: manifest.id,
          name: manifest.name || manifest.id,
          description: manifest.description || '',
          version: manifest.version || '1.0.0',
          types: manifest.types || [],
          catalogs: manifest.catalogs || [],
          resources: manifest.resources || [],
        },
        flags: {},
      });

      setAddonUrl('');
      setShowInstallModal(false);
      Alert.alert('Success', `${manifest.name || manifest.id} has been installed`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to install addon');
    }
    setInstalling(false);
  };

  const handleRemoveAddon = (addon: Addon) => {
    Alert.alert(
      'Remove Addon',
      `Remove ${addon.manifest?.name || addon.addon_id}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeAddon(addon.transport_url),
        },
      ]
    );
  };

  const renderAddonCard = ({ item }: { item: Addon }) => (
    <View style={styles.addonCard}>
      <View style={styles.addonIcon}>
        <Ionicons name="extension-puzzle" size={28} color={Colors.primary} />
      </View>
      <View style={styles.addonInfo}>
        <Text style={styles.addonName}>{item.manifest?.name || item.addon_id}</Text>
        {item.manifest?.description && (
          <Text style={styles.addonDescription} numberOfLines={2}>
            {item.manifest.description}
          </Text>
        )}
        <View style={styles.addonMeta}>
          <Text style={styles.addonVersion}>v{item.manifest?.version || '1.0.0'}</Text>
          {item.manifest?.types && item.manifest.types.length > 0 && (
            <View style={styles.typeBadges}>
              {item.manifest.types.slice(0, 2).map((type: string) => (
                <View key={type} style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{type}</Text>
                </View>
              ))}
              {item.manifest.types.length > 2 && (
                <Text style={styles.moreTypes}>+{item.manifest.types.length - 2}</Text>
              )}
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => handleRemoveAddon(item)}
      >
        <Ionicons name="trash-outline" size={20} color={Colors.error} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Addons</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowInstallModal(true)}
        >
          <Ionicons name="add" size={28} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={addons}
          renderItem={renderAddonCard}
          keyExtractor={(item) => item.addon_id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centerContent}>
              <Ionicons name="extension-puzzle-outline" size={60} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No addons installed</Text>
              <Text style={styles.emptySubtext}>
                Addons provide streaming sources for movies and TV shows
              </Text>
              <TouchableOpacity
                style={styles.installButton}
                onPress={() => setShowInstallModal(true)}
              >
                <Text style={styles.installButtonText}>Install Addon</Text>
              </TouchableOpacity>
            </View>
          }
          ListFooterComponent={
            <>
              {addons.length > 0 ? (
                <TouchableOpacity
                  style={styles.addAddonCard}
                  onPress={() => setShowInstallModal(true)}
                >
                  <Ionicons name="add-circle-outline" size={24} color={Colors.textSecondary} />
                  <Text style={styles.addAddonText}>Install another addon</Text>
                </TouchableOpacity>
              ) : null}
              {PopularAddons}
            </>
          }
        />
      )}

      {/* Install Addon Modal */}
      <Modal
        visible={showInstallModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowInstallModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Install Addon</Text>
            <Text style={styles.modalSubtitle}>
              Enter the addon URL (Stremio-compatible addons)
            </Text>
            <TextInput
              style={styles.input}
              value={addonUrl}
              onChangeText={setAddonUrl}
              placeholder="https://addon-url.com/manifest.json"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowInstallModal(false);
                  setAddonUrl('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, !addonUrl.trim() && styles.disabledButton]}
                onPress={handleInstallAddon}
                disabled={!addonUrl.trim() || installing}
              >
                {installing ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Text style={styles.confirmButtonText}>Install</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  emptyText: {
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
  installButton: {
    marginTop: Spacing.xxl,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.full,
  },
  installButtonText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.background,
  },
  listContent: {
    padding: Spacing.lg,
  },
  addonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  addonIcon: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.lg,
  },
  addonInfo: {
    flex: 1,
  },
  addonName: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
  },
  addonDescription: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  addonMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  addonVersion: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
  typeBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  typeBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
  },
  typeBadgeText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.weights.medium,
  },
  moreTypes: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
  removeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,59,48,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addAddonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginTop: Spacing.md,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
    gap: Spacing.sm,
  },
  addAddonText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium,
    color: Colors.textSecondary,
  },
  popularSection: {
    marginTop: Spacing.xxl,
    paddingTop: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  sectionTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  popularAddon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  popularIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.lg,
  },
  popularInfo: {
    flex: 1,
  },
  popularName: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
  },
  popularDescription: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalContent: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    textAlign: 'center',
    lineHeight: 20,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    fontSize: Typography.sizes.md,
    color: Colors.text,
    marginBottom: Spacing.xl,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
  },
  confirmButton: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    color: Colors.background,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
