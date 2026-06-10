import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { Colors } from '@/constants/colors';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const variantStyles: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: Colors.BLUE, text: Colors.WHITE },
  secondary: { bg: Colors.BG_SURFACE, text: Colors.TEXT_PRIMARY, border: Colors.BORDER },
  danger: { bg: Colors.RED, text: Colors.WHITE },
  ghost: { bg: Colors.TRANSPARENT, text: Colors.BLUE, border: Colors.BLUE },
  success: { bg: Colors.GREEN, text: Colors.WHITE },
};

const sizeStyles: Record<ButtonSize, { paddingV: number; paddingH: number; fontSize: number; radius: number }> = {
  sm: { paddingV: 6, paddingH: 12, fontSize: 12, radius: 6 },
  md: { paddingV: 10, paddingH: 18, fontSize: 14, radius: 8 },
  lg: { paddingV: 14, paddingH: 24, fontSize: 16, radius: 10 },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  textStyle,
}: ButtonProps) {
  const vs = variantStyles[variant];
  const ss = sizeStyles[size];
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        styles.base,
        {
          backgroundColor: vs.bg,
          paddingVertical: ss.paddingV,
          paddingHorizontal: ss.paddingH,
          borderRadius: ss.radius,
          borderWidth: vs.border ? 1 : 0,
          borderColor: vs.border ?? Colors.TRANSPARENT,
          opacity: isDisabled ? 0.55 : 1,
          alignSelf: fullWidth ? undefined : 'flex-start',
          width: fullWidth ? '100%' : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={vs.text} />
      ) : (
        <Text
          style={[
            styles.label,
            { color: vs.text, fontSize: ss.fontSize },
            textStyle,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
