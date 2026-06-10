import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors } from '@/constants/colors';

export type BadgeVariant =
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'neutral'
  | 'buy'
  | 'sell';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}

const variantMap: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: Colors.GREEN_DIM, text: Colors.GREEN },
  danger: { bg: Colors.RED_DIM, text: Colors.RED },
  warning: { bg: Colors.AMBER_DIM, text: Colors.AMBER },
  info: { bg: Colors.BLUE_DIM, text: Colors.BLUE },
  neutral: { bg: Colors.BG_SURFACE, text: Colors.TEXT_SECONDARY },
  buy: { bg: Colors.GREEN_DIM, text: Colors.GREEN },
  sell: { bg: Colors.RED_DIM, text: Colors.RED },
};

export function Badge({ label, variant = 'neutral', small = false, style }: BadgeProps) {
  const { bg, text } = variantMap[variant];
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bg,
          paddingHorizontal: small ? 6 : 8,
          paddingVertical: small ? 2 : 4,
          borderRadius: small ? 4 : 6,
        },
        style,
      ]}
    >
      <Text style={[styles.text, { color: text, fontSize: small ? 10 : 12 }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
