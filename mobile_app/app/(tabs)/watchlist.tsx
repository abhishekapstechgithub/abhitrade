import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMarketStore, type WatchlistItem } from '@/store/useMarketStore';
import { useTradingStore } from '@/store/useTradingStore';
import { WatchlistRow } from '@/components/watchlist/WatchlistRow';
import { Colors } from '@/constants/colors';

const WATCHLIST_TABS = [
  'My Watchlist',
  'Intraday',
  'Options',
  'F&O',
  'Index',
];

export default function WatchlistScreen() {
  const { watchlist, tickPrices, stopTicking } = useMarketStore();
  const { mode, placeOrder } = useTradingStore();
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'symbol' | 'ltp' | 'changePct'>('symbol');
  const [sortAsc, setSortAsc] = useState(true);

  const isPaper = mode === 'paper';

  useEffect(() => {
    if (isPaper) {
      tickPrices();
    } else {
      stopTicking();
    }
    return () => { stopTicking(); };
  }, [isPaper, tickPrices, stopTicking]);

  const filtered = useMemo(() => {
    let items = [...watchlist];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.symbol.toLowerCase().includes(q) ||
          i.company.toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => {
      let diff = 0;
      if (sortBy === 'ltp') diff = a.ltp - b.ltp;
      else if (sortBy === 'changePct') diff = a.changePct - b.changePct;
      else diff = a.symbol.localeCompare(b.symbol);
      return sortAsc ? diff : -diff;
    });
    return items;
  }, [watchlist, searchQuery, sortBy, sortAsc]);

  const handleBuy = (item: WatchlistItem) => {
    Alert.alert(
      `Buy ${item.symbol}`,
      `Place a market BUY order at ₹${item.ltp.toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPaper ? 'Buy (Paper)' : 'Confirm Buy',
          onPress: () => {
            placeOrder({
              symbol: item.symbol,
              side: 'BUY',
              quantity: 1,
              price: item.ltp,
              orderType: 'MARKET',
              productType: 'CNC',
              status: 'OPEN',
              exchange: item.exchange,
            });
            Alert.alert('Order Placed', `BUY order for ${item.symbol} placed successfully.`);
          },
        },
      ]
    );
  };

  const handleSell = (item: WatchlistItem) => {
    Alert.alert(
      `Sell ${item.symbol}`,
      `Place a market SELL order at ₹${item.ltp.toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPaper ? 'Sell (Paper)' : 'Confirm Sell',
          style: 'destructive',
          onPress: () => {
            placeOrder({
              symbol: item.symbol,
              side: 'SELL',
              quantity: 1,
              price: item.ltp,
              orderType: 'MARKET',
              productType: 'CNC',
              status: 'OPEN',
              exchange: item.exchange,
            });
            Alert.alert('Order Placed', `SELL order for ${item.symbol} placed successfully.`);
          },
        },
      ]
    );
  };

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortAsc((v) => !v);
    } else {
      setSortBy(field);
      setSortAsc(true);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Watchlist</Text>
        {isPaper && (
          <View style={styles.paperPill}>
            <Ionicons name="document-text-outline" size={11} color={Colors.AMBER} />
            <Text style={styles.paperPillText}>PAPER</Text>
          </View>
        )}
      </View>

      {/* Horizontal tabs */}
      <View>
        <FlatList
          data={WATCHLIST_TABS}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[styles.tab, activeTab === index && styles.tabActive]}
              onPress={() => setActiveTab(index)}
            >
              <Text style={[styles.tabText, activeTab === index && styles.tabTextActive]}>
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={Colors.TEXT_SECONDARY} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search symbols..."
          placeholderTextColor={Colors.TEXT_SECONDARY}
          autoCapitalize="characters"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={Colors.TEXT_SECONDARY} />
          </TouchableOpacity>
        )}
      </View>

      {/* Sort bar */}
      <View style={styles.sortBar}>
        <Text style={styles.sortLabel}>Sort:</Text>
        {(['symbol', 'ltp', 'changePct'] as const).map((field) => (
          <TouchableOpacity
            key={field}
            style={[styles.sortBtn, sortBy === field && styles.sortBtnActive]}
            onPress={() => toggleSort(field)}
          >
            <Text style={[styles.sortBtnText, sortBy === field && styles.sortBtnTextActive]}>
              {field === 'symbol' ? 'Symbol' : field === 'ltp' ? 'LTP' : 'Chg%'}
            </Text>
            {sortBy === field && (
              <Ionicons
                name={sortAsc ? 'chevron-up' : 'chevron-down'}
                size={12}
                color={Colors.BLUE}
              />
            )}
          </TouchableOpacity>
        ))}
        <Text style={styles.countText}>{filtered.length} symbols</Text>
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <WatchlistRow
            item={item}
            onBuy={handleBuy}
            onSell={handleSell}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="search" size={48} color={Colors.TEXT_SECONDARY} />
            <Text style={styles.emptyTitle}>No instruments found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery ? 'Try a different search term' : 'Long-press a row to reveal Buy/Sell actions'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Hint footer */}
      {filtered.length > 0 && (
        <View style={styles.hintBar}>
          <Ionicons name="hand-left-outline" size={12} color={Colors.TEXT_SECONDARY} />
          <Text style={styles.hintText}>Long-press any row to reveal Buy / Sell actions</Text>
        </View>
      )}
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
  tabsContainer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.BG_SURFACE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    marginHorizontal: 2,
  },
  tabActive: {
    backgroundColor: Colors.BLUE_DIM,
    borderColor: Colors.BLUE,
  },
  tabText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.BLUE,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.BG_SURFACE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    color: Colors.TEXT_PRIMARY,
    fontSize: 14,
    padding: 0,
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  sortLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    marginRight: 2,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.BG_SURFACE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  sortBtnActive: {
    backgroundColor: Colors.BLUE_DIM,
    borderColor: Colors.BLUE,
  },
  sortBtnText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '600',
  },
  sortBtnTextActive: {
    color: Colors.BLUE,
  },
  countText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    marginLeft: 'auto',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    backgroundColor: Colors.BG_SURFACE,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
    justifyContent: 'center',
  },
  hintText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
  },
});
