import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

const items = [
  { path: '/', label: 'Home', icon: 'home-outline' }, { path: '/search', label: 'Search', icon: 'search-outline' },
  { path: '/library', label: 'Library', icon: 'library-outline' }, { path: '/settings', label: 'Settings', icon: 'settings-outline' },
] as const;

export function TvRail() {
  const pathname = usePathname();
  const [expanded, setExpanded] = React.useState(false);
  return <View className={`${expanded ? 'w-60' : 'w-24'} z-40 h-full bg-black/80 px-4 py-10`}>
    <Text className="mb-12 text-center text-3xl font-black text-white">R</Text>
    <View className="gap-4">{items.map((item) => <Pressable key={item.path} onFocus={() => setExpanded(true)} onBlur={() => setExpanded(false)} onPress={() => router.replace(item.path)} className={`${pathname === item.path ? 'bg-white/20' : ''} h-16 flex-row items-center rounded-2xl px-5`}>
      <Ionicons name={item.icon} size={26} color="white" />{expanded && <Text className="ml-5 text-xl font-semibold text-white">{item.label}</Text>}
    </Pressable>)}</View>
  </View>;
}
