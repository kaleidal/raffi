import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSurface } from './GlassSurface';

type Props = { mode: 'home' | 'search' | 'library'; query?: string; onQueryChange?: (value: string) => void; listName?: string; onListPress?: () => void };

export function DynamicDock({ mode, query, onQueryChange, listName, onListPress }: Props) {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="box-none" style={{ bottom: Math.max(insets.bottom, 14) }} className="absolute inset-x-0 z-50 flex-row items-center justify-center gap-3 px-5">
    {mode !== 'home' && <GlassSurface style={{ borderRadius: 28 }}><Pressable onPress={() => router.back()} className="h-14 w-14 items-center justify-center"><Ionicons name="chevron-back" size={25} color="white" /></Pressable></GlassSurface>}
    <GlassSurface style={{ borderRadius: 28 }} className="h-14 flex-1">
      {mode === 'library' ? <Pressable onPress={onListPress} className="h-full flex-row items-center justify-center gap-2 px-5"><Text numberOfLines={1} className="text-base font-semibold text-ink">{listName || 'My library'}</Text><Ionicons name="chevron-down" size={18} color="white" /></Pressable>
        : <View className="h-full flex-row items-center gap-3 px-5"><Ionicons name="search" size={21} color="#ddd" /><TextInput value={query} onChangeText={onQueryChange} onSubmitEditing={() => mode === 'home' && router.push({ pathname: '/search', params: { q: query || '' } })} placeholder="Search anything" placeholderTextColor="#9a9ca3" returnKeyType="search" className="flex-1 text-base text-ink" /></View>}
    </GlassSurface>
    <GlassSurface style={{ borderRadius: 28 }}>
      <Pressable onPress={() => router.push(mode === 'library' ? '/settings' : '/library')} className="h-14 w-14 items-center justify-center"><Ionicons name={mode === 'library' ? 'settings-outline' : 'library-outline'} size={23} color="white" /></Pressable>
    </GlassSurface>
  </View>;
}
