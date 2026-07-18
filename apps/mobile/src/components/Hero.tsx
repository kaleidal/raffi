import type { MediaMeta } from '@raffi/shared';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export function Hero({ item }: { item: MediaMeta }) {
  return <Pressable onPress={() => router.push({ pathname: '/details/[type]/[id]', params: { type: item.type, id: item.imdbId } })} className="mx-6 mb-8 h-72 overflow-hidden rounded-[30px] bg-soft tv:mx-14 tv:h-[420px]">
    <Image source={item.background || item.poster} contentFit="cover" transition={250} className="absolute inset-0 h-full w-full" />
    <LinearGradient colors={['transparent', 'rgba(5,6,8,0.2)', 'rgba(5,6,8,0.96)']} className="absolute inset-0" />
    <View className="absolute inset-x-0 bottom-0 p-6 tv:p-10">
      <Text className="mb-1 text-sm font-medium uppercase tracking-[3px] text-white/70">Our pick</Text>
      <Text numberOfLines={2} className="max-w-2xl text-4xl font-bold tracking-tight text-white tv:text-6xl">{item.name}</Text>
      <View className="mt-4 flex-row items-center gap-2"><Ionicons name="play" color="white" size={20} /><Text className="text-lg font-semibold text-white">View details</Text></View>
    </View>
  </Pressable>;
}
