import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import Button from '../../src/components/Button';
import { useAuth } from '../../src/store/auth-context';

export default function Otp() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const { verifyOtp, sendOtp, isNewWorker } = useAuth();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(30);
  const inputs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  const handleChange = (value: string, idx: number) => {
    const v = value.replace(/[^0-9]/g, '');
    const next = [...digits];
    next[idx] = v.slice(-1);
    setDigits(next);
    if (v && idx < 5) inputs.current[idx + 1]?.focus();
    if (next.every((d) => d !== '') && next.join('').length === 6) {
      handleVerify(next.join(''));
    }
  };

  const handleKeyPress = (e: any, idx: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = async (code?: string) => {
    const otp = code ?? digits.join('');
    if (otp.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await verifyOtp(phone || '', otp);
      router.replace('/(auth)/create-profile');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Invalid OTP. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!phone) return;
    setSeconds(30);
    try {
      await sendOtp(phone);
    } catch {}
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.content}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>

          <Text style={styles.heading}>Verify your number</Text>
          <Text style={styles.subheading}>We sent a 6-digit code to {phone || 'your phone number'}</Text>

          <View style={styles.otpRow}>
            {digits.map((d, idx) => (
              <TextInput
                key={idx}
                ref={(r) => {
                  inputs.current[idx] = r;
                }}
                value={d}
                onChangeText={(v) => handleChange(v, idx)}
                onKeyPress={(e) => handleKeyPress(e, idx)}
                keyboardType="number-pad"
                maxLength={1}
                style={[styles.otpBox, d ? styles.otpBoxFilled : null, error ? styles.otpBoxError : null]}
              />
            ))}
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button title="Verify & Continue" onPress={() => handleVerify()} loading={loading} style={{ marginTop: spacing.xxl }} />

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn't receive the code?</Text>
            <Pressable onPress={resend} disabled={seconds > 0}>
              <Text style={[styles.resendLink, seconds > 0 && { color: colors.textMuted }]}>
                {seconds > 0 ? `Resend in ${seconds}s` : 'Resend OTP'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.lg },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  heading: { fontSize: fontSize.xxxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: spacing.sm },
  subheading: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 21, marginBottom: spacing.xxxl },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  otpBox: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  otpBoxFilled: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  otpBoxError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: fontSize.xs, marginTop: spacing.sm },
  resendRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xxl },
  resendText: { color: colors.textSecondary, fontSize: fontSize.sm },
  resendLink: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});