import type { MediaMeta } from '@raffi/shared';
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { PosterCard } from './PosterCard';

export function ContentRow({ title, items }: { title: string; items: MediaMeta[] }) {
  if (!items.length) return null;
  return <View className="mb-8">
    <Text className="mb-4 px-6 text-2xl font-semibold tracking-tight text-ink">{title}</Text>
    <FlatList horizontal data={items} keyExtractor={(item) => item.id} renderItem={({ item }) => <PosterCard item={item} />}
      contentContainerClassName="px-6" showsHorizontalScrollIndicator={false} />
  </View>;
}
