import type { MediaMeta } from '@raffi/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

export function PosterCard({ item, wide = false }: { item: MediaMeta; wide?: boolean }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <Pressable
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onPress={() => router.push({ pathname: '/details/[type]/[id]', params: { type: item.type, id: item.imdbId } })}
      className={`${wide ? 'w-56' : Platform.isTV ? 'w-40' : 'w-28'} mr-3 rounded-2xl ${focused ? 'scale-105 border-2 border-white' : ''}`}
    >
      <Image source={item.poster} contentFit="cover" transition={180} cachePolicy="memory-disk" className={`${wide ? 'aspect-video' : 'aspect-[2/3]'} w-full rounded-2xl bg-soft`} />
      {Platform.isTV && <View className="px-1 pt-2"><Text numberOfLines={1} className="text-sm font-semibold text-ink">{item.name}</Text></View>}
    </Pressable>
  );
}
