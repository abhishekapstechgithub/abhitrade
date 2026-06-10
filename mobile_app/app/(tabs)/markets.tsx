import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMarketStore, type OptionContract } from '@/store/useMarketStore';
import { useTradingStore } from '@/store/useTradingStore';
import { OptionRow } from '@/components/market/OptionRow';
import { Colors } from '@/constants/colors';

const EXPIRY_DATES = [
  '27 Jun 2024',
  '04 Jul 2024',
  '11 Jul 2024',
  '25 Jul 2024',
  '29 Aug 2024',
];

const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'];

type FilterType = 'all' | 'itm' | 'atm' | 'otm' | 'high-oi';

export default function MarketsScreen() {
  const { optionChain, updateOptionChain, indices } = useMarketStore();
  const { mode, placeOrder } = useTradingStore();
  const [selectedSymbol, setSelectedSymbol] = useState('NIFTY');
  const [selectedExpiry, setSelectedExpiry] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const isPaper = mode === 'paper';
  const niftyIndex = indices.find((i) => i.symbol === 'NIFTY 50');
  const atmStrike = niftyIndex ? Math.round(niftyIndex.ltp / 50) * 50 : 23550;

  const filteredChain = useMemo(() => {
    let chain = [...optionChain];
    if (filter === 'itm') chain = chain.filter((c) => c.isItm);
    else if (filter === 'atm') chain = chain.filter((c) => c.isAtm);
    else if (filter === 'otm') chain = chain.filter((c) => !c.isItm && !c.isAtm);
    else if (filter === 'high-oi') chain = chain.filter((c) => c.ceOi > 1000000 || c.peOi > 1000000);
    return chain;
  }, [optionChain, filter]);

  const handleBuyCe = (contract: OptionContract) => {
    Alert.alert(
      `Buy CE ${contract.strike}`,
      `Buy 1 lot of NIFTY ${contract.strike} CE at ₹${contract.ceLtp.toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPaper ? 'Buy (Paper)' : 'Confirm',
          onPress: () => {
            placeOrder({
              symbol: `NIFTY ${contract.strike} CE`,
              side: 'BUY',
              quantity: 50,
              price: contract.ceLtp,
              orderType: 'MARKET',
              productType: 'MIS',
              status: 'OPEN',
              exchange: 'NSE',
            });
            Alert.alert('Order Placed', `BUY CE ${contract.strike} order placed!`);
          },
        },
      ]
    );
  };

  const handleBuyPe = (contract: OptionContract) => {
    Alert.alert(
      `Buy PE ${contract.strike}`,
      `Buy 1 lot of NIFTY ${contract.strike} PE at ₹${contract.peLtp.toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPaper ? 'Buy (Paper)' : 'Confirm',
          onPress: () => {
            placeOrder({
              symbol: `NIFTY ${contract.strike} PE`,
              side: 'BUY',
              quantity: 50,
              price: contract.peLtp,
              orderType: 'MARKET',
              productType: 'MIS',
              status: 'OPEN',
              exchange: 'NSE',
            });
            Alert.alert('Order Placed', `BUY PE ${contract.strike} order placed!`);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Option Chain</Text>
        {isPaper && (
          <View style={styles.paperPill}>
            <Text style={styles.paperPillText}>PAPER</Text>
          </View>
        )}
      </View>

      {/* Symbol search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={Colors.TEXT_SECONDARY} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search symbol..."
          placeholderTextColor={Colors.TEXT_SECONDARY}
          autoCapitalize="characters"
        />
      </View>

      {/* Symbol chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.symbolsRow}
      >
        {SYMBOLS.map((sym) => (
          <TouchableOpacity
            key={sym}
            style={[styles.symbolChip, selectedSymbol === sym && styles.symbolChipActive]}
            onPress={() => {
              setSelectedSymbol(sym);
              if (sym === 'BANKNIFTY') updateOptionChain(49800);
              else updateOptionChain(atmStrike);
            }}
          >
            <Text style={[styles.symbolChipText, selectedSymbol === sym && styles.symbolChipTextActive]}>
              {sym}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Expiry selector */}
      <View style={styles.expirySection}>
        <Text style={styles.expirySectionLabel}>Expiry:</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.expiryRow}
        >
          {EXPIRY_DATES.map((date, i) => (
            <TouchableOpacity
              key={date}
              style={[styles.expiryChip, selectedExpiry === i && styles.expiryChipActive]}
              onPress={() => setSelectedExpiry(i)}
            >
              <Text style={[styles.expiryText, selectedExpiry === i && styles.expiryTextActive]}>
                {date}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ATM info bar */}
      <View style={styles.atmBar}>
        <View style={styles.atmInfo}>
          <Text style={styles.atmLabel}>{selectedSymbol}</Text>
          <Text style={styles.atmLtp}>
            {niftyIndex?.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 }) ?? '—'}
          </Text>
          <Text style={[
            styles.atmChange,
            { color: (niftyIndex?.change ?? 0) >= 0 ? Colors.GREEN : Colors.RED }
          ]}>
            {(niftyIndex?.change ?? 0) >= 0 ? '+' : ''}
            {niftyIndex?.change.toFixed(2) ?? '—'}
          </Text>
        </View>
        <View style={styles.atmStrikeInfo}>
          <Text style={styles.atmStrikeLabel}>ATM</Text>
          <Text style={styles.atmStrikeValue}>{atmStrike}</Text>
        </View>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {([
          { key: 'all', label: 'All Strikes' },
          { key: 'atm', label: 'Near ATM' },
          { key: 'itm', label: 'ITM' },
          { key: 'otm', label: 'OTM' },
          { key: 'high-oi', label: 'High OI' },
        ] as { key: FilterType; label: string }[]).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterChip, filter === key && styles.filterChipActive]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Table header */}
      <View style={styles.tableHeader}>
        <View style={styles.ceHeaderCell}>
          <Text style={styles.ceHeaderText}>CALLS</Text>
          <Text style={styles.headerSubText}>LTP · OI</Text>
        </View>
        <View style={styles.tableHeaderAction}>
          <Text style={styles.headerActionText}>B</Text>
        </View>
        <View style={styles.strikeHeaderCell}>
          <Text style={styles.strikeHeaderText}>STRIKE</Text>
        </View>
        <View style={styles.tableHeaderAction}>
          <Text style={styles.headerActionText}>B</Text>
        </View>
        <View style={styles.peHeaderCell}>
          <Text style={styles.peHeaderText}>PUTS</Text>
          <Text style={styles.headerSubText}>LTP · OI</Text>
        </View>
      </View>

      {/* Option chain list */}
      <FlatList
        data={filteredChain}
        keyExtractor={(item) => String(item.strike)}
        renderItem={({ item }) => (
          <OptionRow
            contract={item}
            onBuyCe={handleBuyCe}
            onBuyPe={handleBuyPe}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No contracts found for this filter</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.BLUE }]} />
          <Text style={styles.legendText}>ITM</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.AMBER }]} />
          <Text style={styles.legendText}>ATM</Text>
        </View>
        <Text style={styles.legendHint}>Tap B to place quick order</Text>
      </View>
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
  searchInput: {
    flex: 1,
    color: Colors.TEXT_PRIMARY,
    fontSize: 14,
    padding: 0,
  },
  symbolsRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  symbolChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.BG_SURFACE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    marginHorizontal: 2,
  },
  symbolChipActive: {
    backgroundColor: Colors.BLUE_DIM,
    borderColor: Colors.BLUE,
  },
  symbolChipText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '700',
  },
  symbolChipTextActive: {
    color: Colors.BLUE,
  },
  expirySection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    marginBottom: 6,
  },
  expirySectionLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
    width: 46,
  },
  expiryRow: {
    paddingRight: 16,
    gap: 6,
  },
  expiryChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: Colors.BG_SURFACE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    marginHorizontal: 2,
  },
  expiryChipActive: {
    backgroundColor: Colors.BLUE_DIM,
    borderColor: Colors.BLUE,
  },
  expiryText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '600',
  },
  expiryTextActive: {
    color: Colors.BLUE,
  },
  atmBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginVertical: 6,
    backgroundColor: Colors.BG_CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  atmInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  atmLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '600',
  },
  atmLtp: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '800',
  },
  atmChange: {
    fontSize: 13,
    fontWeight: '600',
  },
  atmStrikeInfo: {
    alignItems: 'center',
    backgroundColor: Colors.BLUE_DIM,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.BLUE,
  },
  atmStrikeLabel: {
    color: Colors.BLUE,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  atmStrikeValue: {
    color: Colors.BLUE,
    fontSize: 14,
    fontWeight: '800',
  },
  filterRow: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: Colors.BG_SURFACE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    marginHorizontal: 2,
  },
  filterChipActive: {
    backgroundColor: Colors.BLUE_DIM,
    borderColor: Colors.BLUE,
  },
  filterText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '600',
  },
  filterTextActive: {
    color: Colors.BLUE,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: Colors.BG_SURFACE,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.BORDER,
  },
  ceHeaderCell: {
    flex: 2,
    paddingLeft: 4,
  },
  peHeaderCell: {
    flex: 2,
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  strikeHeaderCell: {
    flex: 2,
    alignItems: 'center',
  },
  tableHeaderAction: {
    width: 22,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  ceHeaderText: {
    color: Colors.GREEN,
    fontSize: 11,
    fontWeight: '700',
  },
  peHeaderText: {
    color: Colors.RED,
    fontSize: 11,
    fontWeight: '700',
  },
  strikeHeaderText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
  },
  headerSubText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 9,
    marginTop: 1,
  },
  headerActionText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 14,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 10,
    backgroundColor: Colors.BG_SURFACE,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
  },
  legendHint: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    marginLeft: 8,
    fontStyle: 'italic',
  },
});
