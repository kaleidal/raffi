import React, { useState } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface TvFocusableProps extends Omit<PressableProps, 'children' | 'style'> {
  children: React.ReactNode | ((focused: boolean) => React.ReactNode);
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
}

export default function TvFocusable({
  children,
  style,
  focusedStyle,
  pressedStyle,
  onFocus,
  onBlur,
  ...props
}: TvFocusableProps) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      {...props}
      focusable
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={({ pressed }) => [
        style,
        focused ? focusedStyle : null,
        pressed ? pressedStyle : null,
      ]}
    >
      {typeof children === 'function' ? children(focused) : children}
    </Pressable>
  );
}
