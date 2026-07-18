import React from 'react';
import { View } from 'react-native';
import { isTV } from '@/lib/platform';
import { TvRail } from './TvRail';

export function AppShell({ children }: React.PropsWithChildren) {
  return <View className="flex-1 flex-row bg-canvas">{isTV && <TvRail />}<View className="flex-1">{children}</View></View>;
}
