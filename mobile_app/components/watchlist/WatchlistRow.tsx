import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import type { WatchlistItem } from '@/store/useMarketStore';

interface WatchlistRowProps {
  item: WatchlistItem;
  onBuy?: (item: WatchlistItem) => void;
  onSell?: (item: WatchlistItem) => void;
  onChart?: (item: WatchlistItem) => void;
}

export function WatchlistRow({ item, onBuy, onSell, onChart }: WatchlistRowProps) {
  const isPositive = item.change >= 0;
  const changeColor = isPositive ? Colors.GREEN : Colors.RED;
  const changeBg = isPositive ? Colors.GREEN_DIM : Colors.RED_DIM;
  const [actionsVisible, setActionsVisible] = useState(false);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onLongPress={() => setActionsVisible((v) => !v)}
      style={styles.container}
    >
      <View style={styles.mainRow}>
        {/* Left: symbol + company */}
        <View style={styles.leftSection}>
          <View style={styles.symbolRow}>
            <Text style={styles.symbol}>{item.symbol}</Text>
            <View style={styles.exchangeBadge}>
              <Text style={styles.exchangeText}>{item.exchange}</Text>
            </View>
          </View>
          <Text style={styles.company} numberOfLines={1}>
            {item.company}
          </Text>
        </View>

        {/* Right: LTP + change */}
        <View style={styles.rightSection}>
          <Text style={styles.ltp}>
            ₹{item.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
          </Text>
          <View style={[styles.changePill, { backgroundColor: changeBg }]}>
            <Ionicons
              name={isPositive ? 'caret-up' : 'caret-down'}
              size={9}
              color={changeColor}
            />
            <Text style={[styles.changePct, { color: changeColor }]}>
              {Math.abs(item.changePct).toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>

      {/* Actions row (revealed on long press) */}
      {actionsVisible && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.buyBtn]}
            onPress={() => { onBuy?.(item); setActionsVisible(false); }}
          >
            <Text style={styles.actionBtnText}>BUY</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.sellBtn]}
            onPress={() => { onSell?.(item); setActionsVisible(false); }}
          >
            <Text style={styles.actionBtnText}>SELL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.chartBtn]}
            onPress={() => { onChart?.(item); setActionsVisible(false); }}
          >
            <Ionicons name="stats-chart" size={14} color={Colors.BLUE} />
            <Text style={[styles.actionBtnText, { color: Colors.BLUE }]}>CHART</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.BG_CARD,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flex: 1,
    marginRight: 12,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  symbol: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '700',
  },
  exchangeBadge: {
    backgroundColor: Colors.BG_SURFACE,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  exchangeText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  company: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
  },
  rightSection: {
    alignItems: 'flex-end',
    gap: 4,
  },
  ltp: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '700',
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
  actionsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  buyBtn: {
    backgroundColor: Colors.GREEN_DIM,
  },
  sellBtn: {
    backgroundColor: Colors.RED_DIM,
  },
  chartBtn: {
    backgroundColor: Colors.BLUE_DIM,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.TEXT_PRIMARY,
  },
});
