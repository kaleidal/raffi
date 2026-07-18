import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { discoverDesktops, getBridgeInfo, localDeviceName, pairDesktop, parsePairingPayload, type DiscoveredDesktop } from '@/lib/bridge';
import { devicePlatform, isTV } from '@/lib/platform';
import { useApp } from '@/state/AppContext';

export default function Pair() {
  const { addDesktop } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [found, setFound] = React.useState<DiscoveredDesktop[]>([]);
  const [selected, setSelected] = React.useState<DiscoveredDesktop | null>(null);
  const [code, setCode] = React.useState('');
  const [manualUrl, setManualUrl] = React.useState('');
  const [working, setWorking] = React.useState(false);
  React.useEffect(() => discoverDesktops((desktop) => setFound((current) => current.some((item) => item.baseUrl === desktop.baseUrl) ? current : [...current, desktop])), []);
  const complete = async (baseUrl: string, challenge: string) => {
    setWorking(true);
    try {
      const info = await getBridgeInfo(baseUrl);
      const response = await pairDesktop(baseUrl, challenge, localDeviceName, devicePlatform);
      await addDesktop({ id: info.id, name: info.name, baseUrl, deviceId: response.deviceId, online: true }, response.token);
      router.back();
    } catch (e) { Alert.alert('Pairing failed', e instanceof Error ? e.message : String(e)); } finally { setWorking(false); }
  };
  const scanned = ({ data }: { data: string }) => { try { const payload = parsePairingPayload(data); void complete(payload.baseUrl, payload.challenge); } catch (e) { Alert.alert('Invalid code', String(e)); } };
  return <AppShell><View className="flex-1 bg-canvas px-6 pb-10 pt-16 tv:px-14 tv:pt-14">
    <Text className="text-4xl font-bold text-ink tv:text-5xl">Pair Raffi Desktop</Text><Text className="mt-3 max-w-2xl text-lg leading-7 text-muted">On your computer, open Raffi Settings → Nearby devices. The computer stays in control of torrenting and transcoding.</Text>
    {working && <ActivityIndicator className="mt-10" color="white" />}
    {!isTV && permission?.granted && <View className="mt-8 h-64 overflow-hidden rounded-3xl"><CameraView onBarcodeScanned={working ? undefined : scanned} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} className="flex-1" /></View>}
    {!isTV && !permission?.granted && <Pressable onPress={() => void requestPermission()} className="mt-8 items-center rounded-2xl bg-white py-4"><Text className="font-bold text-black">Scan desktop QR code</Text></Pressable>}
    <Text className="mb-3 mt-9 text-sm font-semibold uppercase tracking-widest text-muted">Nearby computers</Text>
    <FlatList data={found} keyExtractor={(item) => item.baseUrl} renderItem={({ item }) => <Pressable onPress={() => setSelected(item)} className={`${selected?.baseUrl === item.baseUrl ? 'border-white bg-white/15' : 'border-white/10 bg-panel'} mb-3 rounded-2xl border p-5`}><Text className="text-lg font-semibold text-ink">{item.name}</Text><Text className="mt-1 text-muted">{item.host}</Text></Pressable>} ListEmptyComponent={<Text className="text-muted">No desktops discovered yet. QR pairing still works in Expo Go.</Text>} />
    <View className="mt-5 flex-row gap-3"><TextInput value={manualUrl} onChangeText={setManualUrl} autoCapitalize="none" placeholder="Desktop address (optional)" placeholderTextColor="#777" className="flex-1 rounded-2xl bg-panel px-4 py-4 text-ink" /><TextInput value={code} onChangeText={setCode} keyboardType={Platform.isTV ? 'default' : 'number-pad'} maxLength={6} placeholder="Code" placeholderTextColor="#777" className="w-28 rounded-2xl bg-panel px-4 py-4 text-center text-xl tracking-widest text-ink" /><Pressable disabled={!code || (!selected && !manualUrl)} onPress={() => void complete(selected?.baseUrl || manualUrl, code)} className="justify-center rounded-2xl bg-white px-5"><Text className="font-bold text-black">Pair</Text></Pressable></View>
  </View></AppShell>;
}
