import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import { sendOtp, verifyOtp, registerUser } from '@/lib/api';
import { OtpInput } from '@/components/ui/OtpInput';
import { Colors } from '@/constants/colors';

type AuthTab = 'signin' | 'signup';
type SignInStep = 'email' | 'otp';

export default function LoginScreen() {
  const router = useRouter();
  const { setUser } = useAuthStore();

  const [activeTab, setActiveTab] = useState<AuthTab>('signin');

  // Sign-in state
  const [siEmail, setSiEmail] = useState('');
  const [siStep, setSiStep] = useState<SignInStep>('email');
  const [siOtp, setSiOtp] = useState('');
  const [siLoading, setSiLoading] = useState(false);
  const [siError, setSiError] = useState('');
  const [siDevOtp, setSiDevOtp] = useState('');
  const [siCountdown, setSiCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sign-up state
  const [suName, setSuName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPhone, setSuPhone] = useState('');
  const [suStep, setSuStep] = useState<SignInStep>('email');
  const [suOtp, setSuOtp] = useState('');
  const [suLoading, setSuLoading] = useState(false);
  const [suError, setSuError] = useState('');
  const [suDevOtp, setSuDevOtp] = useState('');
  const [suCountdown, setSuCountdown] = useState(0);
  const suCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = (
    setCountdown: React.Dispatch<React.SetStateAction<number>>,
    ref: React.MutableRefObject<ReturnType<typeof setInterval> | null>
  ) => {
    if (ref.current) clearInterval(ref.current);
    setCountdown(120);
    ref.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (ref.current) clearInterval(ref.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleSendOtp = useCallback(async () => {
    setSiError('');
    if (!siEmail.trim() || !siEmail.includes('@')) {
      setSiError('Please enter a valid email address.');
      return;
    }
    setSiLoading(true);
    const res = await sendOtp(siEmail.trim().toLowerCase());
    setSiLoading(false);
    if (res.ok && res.data) {
      setSiDevOtp(res.data.devOtp ?? '');
      setSiStep('otp');
      startCountdown(setSiCountdown, countdownRef);
    } else {
      setSiError(res.error ?? 'Failed to send OTP. Try again.');
    }
  }, [siEmail]);

  const handleVerifyOtp = useCallback(async () => {
    setSiError('');
    if (siOtp.length !== 6) {
      setSiError('Please enter the 6-digit OTP.');
      return;
    }
    setSiLoading(true);
    const res = await verifyOtp(siEmail.trim().toLowerCase(), siOtp);
    setSiLoading(false);
    if (res.ok && res.data?.user) {
      await setUser(res.data.user);
      router.replace('/(tabs)');
    } else {
      setSiError(res.error ?? 'Invalid OTP. Please try again.');
      setSiOtp('');
    }
  }, [siEmail, siOtp, setUser, router]);

  const handleRegister = useCallback(async () => {
    setSuError('');
    if (!suName.trim()) { setSuError('Name is required.'); return; }
    if (!suEmail.trim() || !suEmail.includes('@')) { setSuError('Enter a valid email.'); return; }
    if (!suPhone.trim() || suPhone.length < 10) { setSuError('Enter a valid 10-digit mobile number.'); return; }
    setSuLoading(true);
    const res = await registerUser(suName.trim(), suEmail.trim().toLowerCase(), suPhone.trim());
    setSuLoading(false);
    if (res.ok && res.data) {
      setSuDevOtp(res.data.devOtp ?? '');
      setSuStep('otp');
      startCountdown(setSuCountdown, suCountdownRef);
    } else {
      setSuError(res.error ?? 'Registration failed. Try again.');
    }
  }, [suName, suEmail, suPhone]);

  const handleVerifySignUpOtp = useCallback(async () => {
    setSuError('');
    if (suOtp.length !== 6) {
      setSuError('Please enter the 6-digit OTP.');
      return;
    }
    setSuLoading(true);
    const res = await verifyOtp(suEmail.trim().toLowerCase(), suOtp);
    setSuLoading(false);
    if (res.ok && res.data?.user) {
      await setUser(res.data.user);
      router.replace('/(tabs)');
    } else {
      setSuError(res.error ?? 'Invalid OTP. Please try again.');
      setSuOtp('');
    }
  }, [suEmail, suOtp, setUser, router]);

  function formatCountdown(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              <Ionicons name="bar-chart" size={36} color={Colors.BLUE} />
            </View>
            <Text style={styles.appName}>AbhiTrade</Text>
            <Text style={styles.tagline}>Smart trading, simplified</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            {/* Segmented control */}
            <View style={styles.tabRow}>
              {(['signin', 'signup'] as AuthTab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
                  onPress={() => {
                    setActiveTab(tab);
                    setSiError('');
                    setSuError('');
                  }}
                >
                  <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                    {tab === 'signin' ? 'Sign In' : 'Create Account'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {activeTab === 'signin' ? (
              /* ---- SIGN IN ---- */
              <View style={styles.form}>
                {siStep === 'email' ? (
                  <>
                    <Text style={styles.inputLabel}>Email address</Text>
                    <TextInput
                      style={styles.input}
                      value={siEmail}
                      onChangeText={setSiEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={Colors.TEXT_SECONDARY}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      returnKeyType="done"
                      onSubmitEditing={handleSendOtp}
                    />
                    {siError ? <Text style={styles.errorText}>{siError}</Text> : null}
                    <TouchableOpacity
                      style={[styles.submitBtn, siLoading && styles.submitBtnDisabled]}
                      onPress={handleSendOtp}
                      disabled={siLoading}
                    >
                      {siLoading ? (
                        <ActivityIndicator size="small" color={Colors.WHITE} />
                      ) : (
                        <Text style={styles.submitBtnText}>Send OTP</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {/* Dev OTP banner */}
                    {siDevOtp ? (
                      <View style={styles.devBanner}>
                        <Ionicons name="information-circle" size={14} color={Colors.AMBER} />
                        <Text style={styles.devBannerText}>
                          Dev OTP: <Text style={styles.devOtpValue}>{siDevOtp}</Text>
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.otpHint}>
                      Enter the 6-digit OTP sent to{' '}
                      <Text style={styles.otpEmail}>{siEmail}</Text>
                    </Text>
                    <View style={styles.otpContainer}>
                      <OtpInput value={siOtp} onChange={setSiOtp} disabled={siLoading} />
                    </View>
                    {siError ? <Text style={styles.errorText}>{siError}</Text> : null}
                    <TouchableOpacity
                      style={[styles.submitBtn, (siLoading || siOtp.length !== 6) && styles.submitBtnDisabled]}
                      onPress={handleVerifyOtp}
                      disabled={siLoading || siOtp.length !== 6}
                    >
                      {siLoading ? (
                        <ActivityIndicator size="small" color={Colors.WHITE} />
                      ) : (
                        <Text style={styles.submitBtnText}>Verify & Sign In</Text>
                      )}
                    </TouchableOpacity>
                    <View style={styles.resendRow}>
                      {siCountdown > 0 ? (
                        <Text style={styles.countdownText}>
                          Resend in {formatCountdown(siCountdown)}
                        </Text>
                      ) : (
                        <TouchableOpacity onPress={handleSendOtp}>
                          <Text style={styles.resendText}>Resend OTP</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => { setSiStep('email'); setSiOtp(''); setSiError(''); }}>
                        <Text style={styles.changeEmailText}>Change email</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            ) : (
              /* ---- SIGN UP ---- */
              <View style={styles.form}>
                {suStep === 'email' ? (
                  <>
                    <Text style={styles.inputLabel}>Full name</Text>
                    <TextInput
                      style={styles.input}
                      value={suName}
                      onChangeText={setSuName}
                      placeholder="Abhishek Yadav"
                      placeholderTextColor={Colors.TEXT_SECONDARY}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                    <Text style={styles.inputLabel}>Email address</Text>
                    <TextInput
                      style={styles.input}
                      value={suEmail}
                      onChangeText={setSuEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={Colors.TEXT_SECONDARY}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      returnKeyType="next"
                    />
                    <Text style={styles.inputLabel}>Mobile number</Text>
                    <View style={styles.phoneRow}>
                      <View style={styles.phonePrefix}>
                        <Text style={styles.phonePrefixText}>+91</Text>
                      </View>
                      <TextInput
                        style={[styles.input, styles.phoneInput]}
                        value={suPhone}
                        onChangeText={(t) => setSuPhone(t.replace(/[^0-9]/g, '').slice(0, 10))}
                        placeholder="9876543210"
                        placeholderTextColor={Colors.TEXT_SECONDARY}
                        keyboardType="phone-pad"
                        returnKeyType="done"
                        onSubmitEditing={handleRegister}
                      />
                    </View>
                    {suError ? <Text style={styles.errorText}>{suError}</Text> : null}
                    <TouchableOpacity
                      style={[styles.submitBtn, suLoading && styles.submitBtnDisabled]}
                      onPress={handleRegister}
                      disabled={suLoading}
                    >
                      {suLoading ? (
                        <ActivityIndicator size="small" color={Colors.WHITE} />
                      ) : (
                        <Text style={styles.submitBtnText}>Create Account</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {suDevOtp ? (
                      <View style={styles.devBanner}>
                        <Ionicons name="information-circle" size={14} color={Colors.AMBER} />
                        <Text style={styles.devBannerText}>
                          Dev OTP: <Text style={styles.devOtpValue}>{suDevOtp}</Text>
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.otpHint}>
                      Enter the 6-digit OTP sent to{' '}
                      <Text style={styles.otpEmail}>{suEmail}</Text>
                    </Text>
                    <View style={styles.otpContainer}>
                      <OtpInput value={suOtp} onChange={setSuOtp} disabled={suLoading} />
                    </View>
                    {suError ? <Text style={styles.errorText}>{suError}</Text> : null}
                    <TouchableOpacity
                      style={[styles.submitBtn, (suLoading || suOtp.length !== 6) && styles.submitBtnDisabled]}
                      onPress={handleVerifySignUpOtp}
                      disabled={suLoading || suOtp.length !== 6}
                    >
                      {suLoading ? (
                        <ActivityIndicator size="small" color={Colors.WHITE} />
                      ) : (
                        <Text style={styles.submitBtnText}>Verify & Continue</Text>
                      )}
                    </TouchableOpacity>
                    <View style={styles.resendRow}>
                      {suCountdown > 0 ? (
                        <Text style={styles.countdownText}>
                          Resend in {formatCountdown(suCountdown)}
                        </Text>
                      ) : (
                        <TouchableOpacity onPress={handleRegister}>
                          <Text style={styles.resendText}>Resend OTP</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => { setSuStep('email'); setSuOtp(''); setSuError(''); }}>
                        <Text style={styles.changeEmailText}>Go back</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}
          </View>

          <Text style={styles.footer}>
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.BG_DARK,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    paddingTop: 40,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 36,
    gap: 6,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.BLUE_DIM,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.BLUE,
    marginBottom: 6,
  },
  appName: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tagline: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 14,
  },
  card: {
    backgroundColor: Colors.BG_CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    overflow: 'hidden',
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: Colors.BG_SURFACE,
  },
  tabBtnActive: {
    backgroundColor: Colors.BG_CARD,
    borderBottomWidth: 2,
    borderBottomColor: Colors.BLUE,
  },
  tabText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.TEXT_PRIMARY,
  },
  form: {
    padding: 20,
    gap: 0,
  },
  inputLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.BG_SURFACE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    color: Colors.TEXT_PRIMARY,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  phonePrefix: {
    backgroundColor: Colors.BG_SURFACE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  phonePrefixText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
  },
  errorText: {
    color: Colors.RED,
    fontSize: 12,
    marginTop: 8,
  },
  submitBtn: {
    backgroundColor: Colors.BLUE,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnDisabled: {
    opacity: 0.55,
  },
  submitBtnText: {
    color: Colors.WHITE,
    fontSize: 16,
    fontWeight: '700',
  },
  devBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.AMBER_DIM,
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.AMBER,
    marginTop: 8,
  },
  devBannerText: {
    color: Colors.AMBER,
    fontSize: 12,
  },
  devOtpValue: {
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 2,
  },
  otpHint: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
    lineHeight: 20,
  },
  otpEmail: {
    color: Colors.TEXT_PRIMARY,
    fontWeight: '600',
  },
  otpContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingHorizontal: 4,
  },
  countdownText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
  },
  resendText: {
    color: Colors.BLUE,
    fontSize: 13,
    fontWeight: '600',
  },
  changeEmailText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  footer: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
