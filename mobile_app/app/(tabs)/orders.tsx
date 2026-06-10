import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTradingStore, type Order } from '@/store/useTradingStore';
import { OrderCard } from '@/components/orders/OrderCard';
import { Colors } from '@/constants/colors';

type OrderTab = 'active' | 'history' | 'trades';

export default function OrdersScreen() {
  const { orders, cancelOrder, mode } = useTradingStore();
  const [activeTab, setActiveTab] = useState<OrderTab>('active');

  const isPaper = mode === 'paper';

  const filteredOrders = useMemo(() => {
    switch (activeTab) {
      case 'active':
        return orders.filter((o) => o.status === 'OPEN' || o.status === 'PENDING');
      case 'history':
        return orders.filter((o) => o.status === 'COMPLETE' || o.status === 'CANCELLED' || o.status === 'REJECTED');
      case 'trades':
        return orders.filter((o) => o.status === 'COMPLETE');
      default:
        return orders;
    }
  }, [orders, activeTab]);

  const handleCancel = (orderId: string) => {
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => cancelOrder(orderId),
        },
      ]
    );
  };

  const counts = useMemo(() => ({
    active: orders.filter((o) => o.status === 'OPEN' || o.status === 'PENDING').length,
    history: orders.filter((o) => ['COMPLETE', 'CANCELLED', 'REJECTED'].includes(o.status)).length,
    trades: orders.filter((o) => o.status === 'COMPLETE').length,
  }), [orders]);

  const TAB_CONFIG: { key: OrderTab; label: string; count: number }[] = [
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'history', label: 'History', count: counts.history },
    { key: 'trades', label: 'Trades', count: counts.trades },
  ];

  // Summary for active tab
  const buyOrders = filteredOrders.filter((o) => o.side === 'BUY').length;
  const sellOrders = filteredOrders.filter((o) => o.side === 'SELL').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        {isPaper && (
          <View style={styles.paperPill}>
            <Ionicons name="document-text-outline" size={11} color={Colors.AMBER} />
            <Text style={styles.paperPillText}>PAPER</Text>
          </View>
        )}
      </View>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        {TAB_CONFIG.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[
                styles.tabBadge,
                activeTab === tab.key ? styles.tabBadgeActive : null
              ]}>
                <Text style={[
                  styles.tabBadgeText,
                  activeTab === tab.key && styles.tabBadgeTextActive
                ]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary bar for active orders */}
      {activeTab === 'active' && filteredOrders.length > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <View style={styles.summaryDot} />
            <Text style={styles.summaryText}>{filteredOrders.length} pending</Text>
          </View>
          <View style={styles.summaryDivider} />
          <Text style={[styles.summaryText, { color: Colors.GREEN }]}>{buyOrders} buy</Text>
          <View style={styles.summaryDivider} />
          <Text style={[styles.summaryText, { color: Colors.RED }]}>{sellOrders} sell</Text>
        </View>
      )}

      {/* Orders list */}
      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onCancel={activeTab === 'active' ? handleCancel : undefined}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={56} color={Colors.TEXT_SECONDARY} />
            <Text style={styles.emptyTitle}>
              {activeTab === 'active' ? 'No active orders' : activeTab === 'trades' ? 'No completed trades' : 'No order history'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'active'
                ? 'Orders you place will appear here'
                : 'Your completed and cancelled orders will appear here'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.BG_DARK,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 22,
    fontWeight: '800',
  },
  paperPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.AMBER_DIM,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.AMBER,
  },
  paperPillText: {
    color: Colors.AMBER,
    fontSize: 10,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.BG_SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: Colors.TRANSPARENT,
  },
  tabActive: {
    borderBottomColor: Colors.BLUE,
  },
  tabText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.BLUE,
  },
  tabBadge: {
    backgroundColor: Colors.BG_CARD,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  tabBadgeActive: {
    backgroundColor: Colors.BLUE_DIM,
    borderColor: Colors.BLUE,
  },
  tabBadgeText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
  },
  tabBadgeTextActive: {
    color: Colors.BLUE,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.BG_SURFACE,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.BLUE,
  },
  summaryText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryDivider: {
    width: 1,
    height: 14,
    backgroundColor: Colors.BORDER,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySubtitle: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
