import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import type { MarketIndex } from '@/store/useMarketStore';

interface IndexChipProps {
  index: MarketIndex;
}

export function IndexChip({ index }: IndexChipProps) {
  const isPositive = index.change >= 0;
  const color = isPositive ? Colors.GREEN : Colors.RED;
  const bgColor = isPositive ? Colors.GREEN_DIM : Colors.RED_DIM;
  const icon = isPositive ? 'caret-up' : 'caret-down';

  return (
    <View style={styles.container}>
      <Text style={styles.symbol} numberOfLines={1}>
        {index.symbol}
      </Text>
      <Text style={[styles.ltp, { color: Colors.TEXT_PRIMARY }]}>
        {index.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
      </Text>
      <View style={[styles.changePill, { backgroundColor: bgColor }]}>
        <Ionicons name={icon} size={10} color={color} />
        <Text style={[styles.changePct, { color }]}>
          {Math.abs(index.changePct).toFixed(2)}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BG_CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  symbol: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  ltp: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  changePct: {
    fontSize: 11,
    fontWeight: '600',
  },
});
