import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import { useTradingStore } from '@/store/useTradingStore';
import { logout as apiLogout } from '@/lib/api';
import { Colors } from '@/constants/colors';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface SettingRowProps {
  icon: IoniconsName;
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  danger?: boolean;
}

function SettingRow({ icon, label, value, onPress, rightElement, danger }: SettingRowProps) {
  return (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      disabled={!onPress && !rightElement}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.settingIcon, danger && styles.settingIconDanger]}>
        <Ionicons name={icon} size={18} color={danger ? Colors.RED : Colors.BLUE} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, danger && styles.settingLabelDanger]}>{label}</Text>
        {value != null && <Text style={styles.settingValue}>{value}</Text>}
      </View>
      {rightElement != null ? (
        rightElement
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={16} color={Colors.TEXT_SECONDARY} />
      ) : null}
    </TouchableOpacity>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, clearUser } = useAuthStore();
  const { mode, setMode } = useTradingStore();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);

  const isPaper = mode === 'paper';
  const initials = getInitials(user?.name ?? 'U');

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await apiLogout();
            await clearUser();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handlePlaceholder = (feature: string) => {
    Alert.alert('Coming Soon', `${feature} will be available in the next update.`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + Name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarGradient}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.userName}>{user?.name ?? 'Trader'}</Text>
          <Text style={styles.userEmail}>{user?.email ?? ''}</Text>
          {user?.phone ? (
            <Text style={styles.userPhone}>+91 {user.phone}</Text>
          ) : null}
          <View style={styles.kycBadge}>
            <Ionicons name="checkmark-circle" size={13} color={Colors.GREEN} />
            <Text style={styles.kycBadgeText}>KYC Verified</Text>
          </View>
        </View>

        {/* Account Section */}
        <Section title="Account">
          <SettingRow
            icon="shield-checkmark-outline"
            label="KYC Status"
            value="Verified"
            onPress={() => handlePlaceholder('KYC Details')}
          />
          <SettingRow
            icon="git-branch-outline"
            label="Active Segments"
            value="Equity, F&O, Currency"
            onPress={() => handlePlaceholder('Segments')}
          />
          <SettingRow
            icon="card-outline"
            label="Subscription Plan"
            value="Pro Trader"
            onPress={() => handlePlaceholder('Plans')}
          />
          <SettingRow
            icon="cash-outline"
            label="Available Margin"
            value="₹1,48,250.00"
            onPress={() => handlePlaceholder('Margin Details')}
          />
        </Section>

        {/* Trading Section */}
        <Section title="Trading">
          <SettingRow
            icon="document-text-outline"
            label="Trading Mode"
            value={isPaper ? 'Paper Trading (Simulated)' : 'Live Trading'}
            rightElement={
              <Switch
                value={isPaper}
                onValueChange={(v) => setMode(v ? 'paper' : 'live')}
                trackColor={{ false: Colors.BORDER, true: Colors.AMBER_DIM }}
                thumbColor={isPaper ? Colors.AMBER : Colors.TEXT_SECONDARY}
                ios_backgroundColor={Colors.BORDER}
              />
            }
          />
          <SettingRow
            icon="link-outline"
            label="Broker Connection"
            value="Not connected"
            onPress={() => handlePlaceholder('Broker API Setup')}
          />
          <SettingRow
            icon="alarm-outline"
            label="Price Alerts"
            value="3 active"
            onPress={() => handlePlaceholder('Alert Manager')}
          />
        </Section>

        {/* Settings Section */}
        <Section title="Settings">
          <SettingRow
            icon="notifications-outline"
            label="Push Notifications"
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: Colors.BORDER, true: Colors.BLUE_DIM }}
                thumbColor={notificationsEnabled ? Colors.BLUE : Colors.TEXT_SECONDARY}
                ios_backgroundColor={Colors.BORDER}
              />
            }
          />
          <SettingRow
            icon="language-outline"
            label="Language"
            value="English"
            onPress={() => handlePlaceholder('Language Settings')}
          />
          <SettingRow
            icon="color-palette-outline"
            label="Theme"
            value="Dark"
            onPress={() => handlePlaceholder('Theme Settings')}
          />
        </Section>

        {/* Security Section */}
        <Section title="Security">
          <SettingRow
            icon="lock-closed-outline"
            label="Change Password"
            onPress={() => handlePlaceholder('Change Password')}
          />
          <SettingRow
            icon="key-outline"
            label="Two-Factor Authentication"
            rightElement={
              <Switch
                value={twoFaEnabled}
                onValueChange={(v) => {
                  if (v) {
                    Alert.alert('Enable 2FA', '2FA setup will be available soon.');
                  } else {
                    setTwoFaEnabled(false);
                  }
                }}
                trackColor={{ false: Colors.BORDER, true: Colors.GREEN_DIM }}
                thumbColor={twoFaEnabled ? Colors.GREEN : Colors.TEXT_SECONDARY}
                ios_backgroundColor={Colors.BORDER}
              />
            }
          />
          <SettingRow
            icon="time-outline"
            label="Login Activity"
            value="Last login: Today, 9:32 AM"
            onPress={() => handlePlaceholder('Login Activity')}
          />
        </Section>

        {/* Support */}
        <Section title="Support">
          <SettingRow
            icon="help-circle-outline"
            label="Help & FAQ"
            onPress={() => handlePlaceholder('Help Center')}
          />
          <SettingRow
            icon="chatbubble-outline"
            label="Contact Support"
            onPress={() => handlePlaceholder('Support Chat')}
          />
          <SettingRow
            icon="document-outline"
            label="Terms & Privacy"
            onPress={() => handlePlaceholder('Legal Documents')}
          />
        </Section>

        {/* App info */}
        <View style={styles.appInfo}>
          <View style={styles.appInfoLogoRow}>
            <Ionicons name="bar-chart" size={16} color={Colors.BLUE} />
            <Text style={styles.appInfoName}>AbhiTrade</Text>
          </View>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
        </View>

        {/* Logout button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color={Colors.RED} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

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
    paddingTop: 16,
  },
  avatarSection: {
    alignItems: 'center',
    paddingBottom: 24,
    paddingTop: 8,
    gap: 4,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.BLUE_DIM,
    borderWidth: 2,
    borderColor: Colors.BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    // Simulated gradient with shadow
    shadowColor: Colors.BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarText: {
    color: Colors.WHITE,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1,
  },
  userName: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  userEmail: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    marginTop: 2,
  },
  userPhone: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
  },
  kycBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.GREEN_DIM,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.GREEN,
  },
  kycBadgeText: {
    color: Colors.GREEN,
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingLeft: 4,
  },
  sectionCard: {
    backgroundColor: Colors.BG_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    gap: 12,
  },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: Colors.BLUE_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingIconDanger: {
    backgroundColor: Colors.RED_DIM,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '600',
  },
  settingLabelDanger: {
    color: Colors.RED,
  },
  settingValue: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    marginTop: 2,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 4,
  },
  appInfoLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appInfoName: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: '700',
  },
  appVersion: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.RED_DIM,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.RED,
    paddingVertical: 14,
    marginBottom: 8,
  },
  logoutText: {
    color: Colors.RED,
    fontSize: 16,
    fontWeight: '700',
  },
  bottomPad: {
    height: 24,
  },
});
