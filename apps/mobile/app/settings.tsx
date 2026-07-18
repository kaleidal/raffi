import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { GlassSurface } from '@/components/GlassSurface';
import { signIn } from '@/lib/auth';
import { useApp } from '@/state/AppContext';

function Row({ icon, title, detail, onPress, danger = false }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail?: string; onPress?: () => void; danger?: boolean }) {
  return <Pressable onPress={onPress} className="min-h-16 flex-row items-center border-b border-white/5 px-1 py-3"><View className="h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Ionicons name={icon} size={21} color={danger ? '#ff7777' : 'white'} /></View><View className="ml-4 flex-1"><Text className={`${danger ? 'text-red-400' : 'text-ink'} text-base font-semibold`}>{title}</Text>{detail && <Text numberOfLines={1} className="mt-0.5 text-sm text-muted">{detail}</Text>}</View><Ionicons name="chevron-forward" size={19} color="#777" /></Pressable>;
}

export default function Settings() {
  const { addons, desktops, user, addAddon, removeAddon, removeDesktop, setUser, sync } = useApp();
  const [addonOpen, setAddonOpen] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const connectAccount = async () => { try { const next = await signIn(); await setUser(next); await sync(); } catch (e) { Alert.alert('Could not sign in', e instanceof Error ? e.message : String(e)); } };
  const install = async () => { setSaving(true); setError(''); try { await addAddon(url); setUrl(''); setAddonOpen(false); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); } };
  return <AppShell><ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ alignSelf: 'center', width: '100%', maxWidth: 768, paddingHorizontal: 24, paddingBottom: 80, paddingTop: 64 }}>
    <Text className="mb-9 text-4xl font-bold tracking-tight text-ink tv:text-5xl">Settings</Text>
    <Text className="mb-2 ml-1 text-sm font-semibold uppercase tracking-widest text-muted">Account</Text><View className="mb-8 rounded-3xl bg-panel px-5">
      <Row icon="person-outline" title={user?.name || user?.email || 'Use Raffi without an account'} detail={user ? 'Progress, addons and lists sync across devices' : 'Sign in only when you want sync'} onPress={user ? () => void setUser(null) : () => void connectAccount()} />
      {user && <Row icon="sync-outline" title="Sync now" detail="Merge local and cloud data safely" onPress={() => void sync().catch((e) => Alert.alert('Sync failed', String(e)))} />}
    </View>
    <Text className="mb-2 ml-1 text-sm font-semibold uppercase tracking-widest text-muted">Playback</Text><View className="mb-8 rounded-3xl bg-panel px-5">
      <Row icon="desktop-outline" title="Raffi Desktop" detail={desktops.length ? `${desktops.length} paired computer${desktops.length === 1 ? '' : 's'}` : 'Pair for torrents and incompatible formats'} onPress={() => router.push('/pair')} />
      <Row icon="extension-puzzle-outline" title="Add source addon" detail="Paste a Stremio addon URL" onPress={() => setAddonOpen(true)} />
      {addons.map((addon) => <Row key={addon.transportUrl} icon="link-outline" title={addon.manifest.name} detail={addon.transportUrl} onPress={() => Alert.alert('Remove addon?', addon.manifest.name, [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void removeAddon(addon.transportUrl) }])} />)}
    </View>
    {desktops.length > 0 && <><Text className="mb-2 ml-1 text-sm font-semibold uppercase tracking-widest text-muted">Paired devices</Text><View className="rounded-3xl bg-panel px-5">{desktops.map((desktop) => <Row key={desktop.id} icon="desktop-outline" title={desktop.name} detail={desktop.baseUrl} danger onPress={() => Alert.alert('Forget desktop?', desktop.name, [{ text: 'Cancel' }, { text: 'Forget', style: 'destructive', onPress: () => void removeDesktop(desktop.id) }])} />)}</View></>}
    <Modal transparent visible={addonOpen} animationType="fade" onRequestClose={() => setAddonOpen(false)}><Pressable onPress={() => setAddonOpen(false)} className="flex-1 items-center justify-center bg-black/60 p-5"><GlassSurface style={{ borderRadius: 28 }} className="w-full max-w-xl p-6"><Text className="text-2xl font-bold text-ink">Add a source</Text><Text className="mt-2 text-muted">Paste the addon’s manifest URL. It stays local unless you sign in.</Text><TextInput autoCapitalize="none" autoCorrect={false} value={url} onChangeText={setUrl} placeholder="https://…/manifest.json" placeholderTextColor="#777" className="mt-6 rounded-2xl bg-white/10 px-4 py-4 text-ink" />{error && <Text className="mt-3 text-red-400">{error}</Text>}<Pressable disabled={saving} onPress={() => void install()} className="mt-5 items-center rounded-2xl bg-white py-4"><Text className="font-bold text-black">{saving ? 'Checking…' : 'Add addon'}</Text></Pressable></GlassSurface></Pressable></Modal>
  </ScrollView></AppShell>;
}
