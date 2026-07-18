import type { MediaMeta, RaffiList } from '@raffi/shared';
import React from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { DynamicDock } from '@/components/DynamicDock';
import { GlassSurface } from '@/components/GlassSurface';
import { PosterCard } from '@/components/PosterCard';
import { isTV } from '@/lib/platform';
import { useApp } from '@/state/AppContext';

export default function Library() {
  const { lists, createList } = useApp();
  const [selectedId, setSelectedId] = React.useState<string | null>(lists[0]?.id ?? null);
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const selected = lists.find((list) => list.id === selectedId) ?? lists[0];
  const items: MediaMeta[] = (selected?.items ?? []).map((item) => ({ id: item.imdbId, imdbId: item.imdbId, type: item.type, name: selected?.name || 'Saved', poster: item.poster }));
  const choose = (list: RaffiList) => { setSelectedId(list.id); setOpen(false); };
  const submit = async () => { if (!name.trim()) return; const list = await createList(name.trim()); setName(''); setCreating(false); choose(list); };
  return <AppShell><View className="flex-1 bg-canvas px-6 pt-16 tv:px-14 tv:pt-14">
    {isTV && <Text className="mb-8 text-5xl font-bold text-ink">{selected?.name || 'My library'}</Text>}
    <FlatList data={items} numColumns={isTV ? 6 : 3} key={isTV ? 'tv' : 'phone'} keyExtractor={(item) => item.id} renderItem={({ item }) => <PosterCard item={item} />}
      ListEmptyComponent={<View className="mt-32 items-center"><Text className="text-center text-xl font-semibold text-ink">Nothing here yet</Text><Text className="mt-2 max-w-sm text-center text-muted">Create a list, then save movies and episodes from their details.</Text><Pressable onPress={() => setOpen(true)} className="mt-7 rounded-full bg-white px-6 py-3"><Text className="font-bold text-black">Choose a list</Text></Pressable></View>} columnWrapperStyle={{ marginBottom: 20 }} contentContainerStyle={{ paddingBottom: 120 }} />
    {!isTV && <DynamicDock mode="library" listName={selected?.name || 'My library'} onListPress={() => setOpen(true)} />}
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><Pressable onPress={() => setOpen(false)} className="flex-1 justify-end bg-black/55 p-4 tv:items-center tv:justify-center">
      <GlassSurface style={{ borderRadius: 28 }} className="max-h-[70%] p-5 tv:w-[520px]"><Text className="mb-4 text-2xl font-bold text-ink">Your lists</Text>{lists.map((list) => <Pressable key={list.id} onPress={() => choose(list)} className="rounded-2xl px-4 py-4"><Text className="text-lg text-ink">{list.name}</Text></Pressable>)}
        {creating ? <View className="mt-2 flex-row gap-3"><TextInput autoFocus value={name} onChangeText={setName} onSubmitEditing={() => void submit()} placeholder="List name" placeholderTextColor="#888" className="flex-1 rounded-2xl bg-white/10 px-4 text-ink" /><Pressable onPress={() => void submit()} className="rounded-2xl bg-white px-5 py-4"><Text className="font-bold text-black">Create</Text></Pressable></View>
          : <Pressable onPress={() => setCreating(true)} className="mt-3 rounded-2xl border border-white/20 px-4 py-4"><Text className="font-semibold text-ink">＋ New list</Text></Pressable>}
      </GlassSurface></Pressable></Modal>
  </View></AppShell>;
}
