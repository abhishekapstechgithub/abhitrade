import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import type { OptionContract } from '@/store/useMarketStore';

interface OptionRowProps {
  contract: OptionContract;
  onBuyCe?: (contract: OptionContract) => void;
  onBuyPe?: (contract: OptionContract) => void;
}

function formatNum(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export function OptionRow({ contract, onBuyCe, onBuyPe }: OptionRowProps) {
  const rowBg = contract.isAtm
    ? Colors.BLUE_DIM
    : contract.isItm
    ? '#0a1929'
    : Colors.BG_CARD;

  const strikeColor = contract.isAtm ? Colors.BLUE : Colors.TEXT_PRIMARY;

  return (
    <TouchableOpacity activeOpacity={0.8} style={[styles.row, { backgroundColor: rowBg }]}>
      {/* CE side */}
      <View style={styles.ceCell}>
        <Text style={styles.ltp}>{contract.ceLtp.toFixed(1)}</Text>
        <Text style={styles.oi}>{formatNum(contract.ceOi)}</Text>
      </View>

      {/* Divider + CE action */}
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => onBuyCe?.(contract)}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <Text style={styles.buyLabel}>B</Text>
      </TouchableOpacity>

      {/* Strike */}
      <View style={styles.strikeCell}>
        <Text style={[styles.strike, { color: strikeColor }]}>
          {contract.strike.toLocaleString('en-IN')}
        </Text>
        {contract.isAtm && (
          <View style={styles.atmDot} />
        )}
      </View>

      {/* PE action */}
      <TouchableOpacity
        style={[styles.actionBtn, styles.sellBtn]}
        onPress={() => onBuyPe?.(contract)}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <Text style={styles.sellLabel}>B</Text>
      </TouchableOpacity>

      {/* PE side */}
      <View style={styles.peCell}>
        <Text style={styles.ltp}>{contract.peLtp.toFixed(1)}</Text>
        <Text style={styles.oi}>{formatNum(contract.peOi)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  ceCell: {
    flex: 2,
    alignItems: 'flex-start',
    paddingLeft: 4,
  },
  peCell: {
    flex: 2,
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  strikeCell: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ltp: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: '600',
  },
  oi: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    marginTop: 2,
  },
  strike: {
    fontSize: 13,
    fontWeight: '700',
  },
  atmDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.BLUE,
    marginTop: 3,
  },
  actionBtn: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: Colors.GREEN_DIM,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  sellBtn: {
    backgroundColor: Colors.RED_DIM,
  },
  buyLabel: {
    color: Colors.GREEN,
    fontSize: 10,
    fontWeight: '800',
  },
  sellLabel: {
    color: Colors.RED,
    fontSize: 10,
    fontWeight: '800',
  },
});
