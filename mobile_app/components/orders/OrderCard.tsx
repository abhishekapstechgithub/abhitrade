import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { Badge } from '@/components/ui/Badge';
import type { Order } from '@/store/useTradingStore';
import type { BadgeVariant } from '@/components/ui/Badge';

interface OrderCardProps {
  order: Order;
  onCancel?: (orderId: string) => void;
}

function statusVariant(status: Order['status']): BadgeVariant {
  switch (status) {
    case 'OPEN': return 'info';
    case 'COMPLETE': return 'success';
    case 'REJECTED': return 'danger';
    case 'CANCELLED': return 'warning';
    case 'PENDING': return 'neutral';
    default: return 'neutral';
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return iso;
  }
}

export function OrderCard({ order, onCancel }: OrderCardProps) {
  const isBuy = order.side === 'BUY';
  const sideColor = isBuy ? Colors.GREEN : Colors.RED;
  const sideBg = isBuy ? Colors.GREEN_DIM : Colors.RED_DIM;
  const canCancel = order.status === 'OPEN' || order.status === 'PENDING';

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.symbolSection}>
          <View style={[styles.sideBadge, { backgroundColor: sideBg }]}>
            <Text style={[styles.sideText, { color: sideColor }]}>{order.side}</Text>
          </View>
          <Text style={styles.symbol} numberOfLines={1}>{order.symbol}</Text>
        </View>
        <Badge label={order.status} variant={statusVariant(order.status)} small />
      </View>

      {/* Details row */}
      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Qty</Text>
          <Text style={styles.detailValue}>{order.quantity}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Price</Text>
          <Text style={styles.detailValue}>₹{order.price.toFixed(2)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Type</Text>
          <Text style={styles.detailValue}>{order.orderType}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Product</Text>
          <Text style={styles.detailValue}>{order.productType}</Text>
        </View>
      </View>

      {/* Avg fill price if complete */}
      {order.avgFillPrice != null && (
        <View style={styles.fillRow}>
          <Text style={styles.fillLabel}>Avg Fill: </Text>
          <Text style={styles.fillValue}>₹{order.avgFillPrice.toFixed(2)}</Text>
          <Text style={styles.fillLabel}> · Filled: </Text>
          <Text style={styles.fillValue}>{order.filledQty}/{order.quantity}</Text>
        </View>
      )}

      {/* Rejection reason */}
      {order.rejectionReason != null && (
        <View style={styles.rejectRow}>
          <Ionicons name="alert-circle" size={12} color={Colors.RED} />
          <Text style={styles.rejectText}>{order.rejectionReason}</Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Ionicons name="time-outline" size={11} color={Colors.TEXT_SECONDARY} />
          <Text style={styles.timeText}>{formatTime(order.timestamp)}</Text>
          <Text style={styles.orderId}> · {order.id}</Text>
        </View>
        {canCancel && onCancel != null && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => onCancel(order.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.BG_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    padding: 14,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  symbolSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  sideBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  sideText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  symbol: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailItem: {
    alignItems: 'center',
    flex: 1,
  },
  detailLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    marginBottom: 2,
  },
  detailValue: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: '600',
  },
  fillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    backgroundColor: Colors.BG_SURFACE,
    borderRadius: 6,
    padding: 6,
  },
  fillLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
  },
  fillValue: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 11,
    fontWeight: '600',
  },
  rejectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  rejectText: {
    color: Colors.RED,
    fontSize: 11,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    marginLeft: 2,
  },
  orderId: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
  },
  cancelBtn: {
    backgroundColor: Colors.RED_DIM,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  cancelText: {
    color: Colors.RED,
    fontSize: 12,
    fontWeight: '600',
  },
});
