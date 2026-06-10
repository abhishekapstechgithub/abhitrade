import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import { useMarketStore } from '@/store/useMarketStore';
import { useTradingStore } from '@/store/useTradingStore';
import { IndexChip } from '@/components/market/IndexChip';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Colors } from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const PORTFOLIO_VALUE = 284750.50;
const PORTFOLIO_INVESTED = 265000.00;
const TODAY_PNL = 3247.80;
const TODAY_PNL_PCT = 1.15;
const OVERALL_RETURN = PORTFOLIO_VALUE - PORTFOLIO_INVESTED;
const OVERALL_RETURN_PCT = ((OVERALL_RETURN / PORTFOLIO_INVESTED) * 100);

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { indices, tickPrices, stopTicking } = useMarketStore();
  const { mode, setMode, orders } = useTradingStore();
  const [refreshing, setRefreshing] = React.useState(false);

  const isPaper = mode === 'paper';
  const firstName = user?.name?.split(' ')[0] ?? 'Trader';

  // Tick prices in paper mode
  useEffect(() => {
    if (isPaper) {
      tickPrices();
    } else {
      stopTicking();
    }
    return () => { stopTicking(); };
  }, [isPaper, tickPrices, stopTicking]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setRefreshing(false);
  }, []);

  const recentOrders = orders.slice(0, 3);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.BLUE} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoMini}>
              <Ionicons name="bar-chart" size={18} color={Colors.BLUE} />
            </View>
            <View>
              <Text style={styles.appNameSmall}>AbhiTrade</Text>
              <Text style={styles.greeting}>{getGreeting()}, {firstName}!</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.notifBtn}>
            <Ionicons name="notifications-outline" size={22} color={Colors.TEXT_SECONDARY} />
            <View style={styles.notifDot} />
          </TouchableOpacity>
        </View>

        {/* Live / Paper toggle */}
        <View style={styles.modeToggleRow}>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modePill, !isPaper && styles.modePillActive]}
              onPress={() => setMode('live')}
            >
              <View style={[styles.modeDot, { backgroundColor: !isPaper ? Colors.GREEN : Colors.TEXT_SECONDARY }]} />
              <Text style={[styles.modePillText, !isPaper && styles.modePillTextActive]}>LIVE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modePill, isPaper && styles.modePillActivePaper]}
              onPress={() => setMode('paper')}
            >
              <Ionicons name="document-text-outline" size={12} color={isPaper ? Colors.AMBER : Colors.TEXT_SECONDARY} />
              <Text style={[styles.modePillText, isPaper && styles.modePillTextPaper]}>PAPER</Text>
            </TouchableOpacity>
          </View>
          {isPaper && (
            <Text style={styles.paperNote}>Prices are simulated</Text>
          )}
        </View>

        {/* Market Indices */}
        <Text style={styles.sectionTitle}>Market Overview</Text>
        <View style={styles.indicesRow}>
          {indices.map((idx) => (
            <IndexChip key={idx.symbol} index={idx} />
          ))}
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsRow}>
          {[
            { icon: 'podium-outline' as const, label: 'Option Chain', route: '/(tabs)/markets' },
            { icon: 'stats-chart-outline' as const, label: 'Charts', route: '/(tabs)/markets' },
            { icon: 'receipt-outline' as const, label: 'Orders', route: '/(tabs)/orders' },
            { icon: 'list-outline' as const, label: 'Watchlist', route: '/(tabs)/watchlist' },
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              style={styles.quickAction}
              onPress={() => router.push(action.route as Parameters<typeof router.push>[0])}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name={action.icon} size={22} color={Colors.BLUE} />
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Portfolio Summary Card */}
        <Text style={styles.sectionTitle}>Portfolio</Text>
        <Card style={styles.portfolioCard}>
          {isPaper && (
            <View style={styles.paperBadgeRow}>
              <Badge label="Paper Trading" variant="warning" small />
            </View>
          )}
          <View style={styles.portfolioTopRow}>
            <View>
              <Text style={styles.portfolioLabel}>Total Value</Text>
              <Text style={styles.portfolioValue}>
                ₹{PORTFOLIO_VALUE.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={[
              styles.returnPill,
              { backgroundColor: OVERALL_RETURN >= 0 ? Colors.GREEN_DIM : Colors.RED_DIM }
            ]}>
              <Ionicons
                name={OVERALL_RETURN >= 0 ? 'trending-up' : 'trending-down'}
                size={14}
                color={OVERALL_RETURN >= 0 ? Colors.GREEN : Colors.RED}
              />
              <Text style={[
                styles.returnPillText,
                { color: OVERALL_RETURN >= 0 ? Colors.GREEN : Colors.RED }
              ]}>
                {OVERALL_RETURN_PCT >= 0 ? '+' : ''}{OVERALL_RETURN_PCT.toFixed(2)}%
              </Text>
            </View>
          </View>

          <View style={styles.portfolioStatsRow}>
            <View style={styles.portfolioStat}>
              <Text style={styles.portfolioStatLabel}>Today's P&L</Text>
              <Text style={[
                styles.portfolioStatValue,
                { color: TODAY_PNL >= 0 ? Colors.GREEN : Colors.RED }
              ]}>
                {TODAY_PNL >= 0 ? '+' : ''}₹{Math.abs(TODAY_PNL).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </Text>
              <Text style={[
                styles.portfolioStatPct,
                { color: TODAY_PNL >= 0 ? Colors.GREEN : Colors.RED }
              ]}>
                {TODAY_PNL_PCT >= 0 ? '+' : ''}{TODAY_PNL_PCT.toFixed(2)}%
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.portfolioStat}>
              <Text style={styles.portfolioStatLabel}>Invested</Text>
              <Text style={styles.portfolioStatValue}>
                ₹{PORTFOLIO_INVESTED.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.portfolioStat}>
              <Text style={styles.portfolioStatLabel}>Overall P&L</Text>
              <Text style={[
                styles.portfolioStatValue,
                { color: OVERALL_RETURN >= 0 ? Colors.GREEN : Colors.RED }
              ]}>
                {OVERALL_RETURN >= 0 ? '+' : ''}₹{Math.abs(OVERALL_RETURN).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        </Card>

        {/* Recent Orders */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recent Orders</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
            <Text style={styles.viewAllText}>View all</Text>
          </TouchableOpacity>
        </View>

        {recentOrders.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>No orders yet</Text>
          </Card>
        ) : (
          recentOrders.map((order) => {
            const isBuy = order.side === 'BUY';
            const sideColor = isBuy ? Colors.GREEN : Colors.RED;
            const sideBg = isBuy ? Colors.GREEN_DIM : Colors.RED_DIM;
            return (
              <View key={order.id} style={styles.recentOrderRow}>
                <View style={[styles.recentOrderSide, { backgroundColor: sideBg }]}>
                  <Text style={[styles.recentOrderSideText, { color: sideColor }]}>
                    {order.side}
                  </Text>
                </View>
                <View style={styles.recentOrderMid}>
                  <Text style={styles.recentOrderSymbol} numberOfLines={1}>{order.symbol}</Text>
                  <Text style={styles.recentOrderDetail}>
                    {order.quantity} × ₹{order.price.toFixed(2)} · {order.orderType}
                  </Text>
                </View>
                <Badge
                  label={order.status}
                  variant={
                    order.status === 'COMPLETE' ? 'success' :
                    order.status === 'OPEN' ? 'info' :
                    order.status === 'REJECTED' ? 'danger' : 'warning'
                  }
                  small
                />
              </View>
            );
          })
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.BG_DARK,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoMini: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.BLUE_DIM,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.BLUE,
  },
  appNameSmall: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  greeting: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    marginTop: 1,
  },
  notifBtn: {
    position: 'relative',
    padding: 6,
  },
  notifDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.RED,
    borderWidth: 1.5,
    borderColor: Colors.BG_DARK,
  },
  modeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.BG_SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    padding: 3,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  modePillActive: {
    backgroundColor: Colors.GREEN_DIM,
    borderWidth: 1,
    borderColor: Colors.GREEN,
  },
  modePillActivePaper: {
    backgroundColor: Colors.AMBER_DIM,
    borderWidth: 1,
    borderColor: Colors.AMBER,
  },
  modeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  modePillText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  modePillTextActive: {
    color: Colors.GREEN,
  },
  modePillTextPaper: {
    color: Colors.AMBER,
  },
  paperNote: {
    color: Colors.AMBER,
    fontSize: 11,
    fontStyle: 'italic',
  },
  sectionTitle: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  viewAllText: {
    color: Colors.BLUE,
    fontSize: 13,
    fontWeight: '600',
  },
  indicesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  quickAction: {
    alignItems: 'center',
    gap: 6,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.BLUE_DIM,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 64,
  },
  portfolioCard: {
    marginBottom: 20,
  },
  paperBadgeRow: {
    marginBottom: 10,
  },
  portfolioTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  portfolioLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    marginBottom: 4,
  },
  portfolioValue: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 24,
    fontWeight: '800',
  },
  returnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  returnPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  portfolioStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
  },
  portfolioStat: {
    flex: 1,
    alignItems: 'center',
  },
  portfolioStatLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    marginBottom: 4,
    textAlign: 'center',
  },
  portfolioStatValue: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  portfolioStatPct: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.BORDER,
  },
  recentOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.BG_CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  recentOrderSide: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  recentOrderSideText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  recentOrderMid: {
    flex: 1,
  },
  recentOrderSymbol: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '600',
  },
  recentOrderDetail: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    marginTop: 2,
  },
  emptyText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },
  bottomPad: {
    height: 24,
  },
});
