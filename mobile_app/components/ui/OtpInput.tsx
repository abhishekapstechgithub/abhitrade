import React, { useRef, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { Colors } from '@/constants/colors';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (otp: string) => void;
  disabled?: boolean;
}

export function OtpInput({ length = 6, value, onChange, disabled = false }: OtpInputProps) {
  const inputs = useRef<Array<TextInput | null>>(Array(length).fill(null));
  const digits = value.padEnd(length, '').split('').slice(0, length);

  const handleChange = (index: number, char: string) => {
    // Only take the last character typed
    const digit = char.replace(/[^0-9]/g, '').slice(-1);
    const arr = [...digits];
    arr[index] = digit;
    const next = arr.join('').replace(/\s/g, '');
    onChange(next);

    if (digit && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    index: number,
    e: NativeSyntheticEvent<TextInputKeyPressEventData>
  ) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputs.current[index - 1]?.focus();
        const arr = [...digits];
        arr[index - 1] = '';
        onChange(arr.join('').replace(/\s/g, ''));
      } else {
        const arr = [...digits];
        arr[index] = '';
        onChange(arr.join('').replace(/\s/g, ''));
      }
    }
  };

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  return (
    <View style={styles.container}>
      {Array.from({ length }).map((_, i) => (
        <TextInput
          key={i}
          ref={(ref) => { inputs.current[i] = ref; }}
          style={[
            styles.box,
            focusedIndex === i && styles.boxFocused,
            digits[i] ? styles.boxFilled : null,
          ]}
          keyboardType="number-pad"
          maxLength={1}
          value={digits[i] === ' ' ? '' : digits[i]}
          onChangeText={(t) => handleChange(i, t)}
          onKeyPress={(e) => handleKeyPress(i, e)}
          onFocus={() => setFocusedIndex(i)}
          onBlur={() => setFocusedIndex(null)}
          editable={!disabled}
          selectTextOnFocus
          caretHidden
          textAlign="center"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  box: {
    width: 46,
    height: 54,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.BORDER,
    backgroundColor: Colors.BG_SURFACE,
    color: Colors.TEXT_PRIMARY,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  boxFocused: {
    borderColor: Colors.BLUE,
    backgroundColor: Colors.BLUE_DIM,
  },
  boxFilled: {
    borderColor: Colors.BLUE,
  },
});
