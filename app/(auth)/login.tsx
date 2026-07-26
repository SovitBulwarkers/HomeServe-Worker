import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Input } from '../../src/components/ui';
import Button from '../../src/components/Button';
import { useAuth } from '../../src/store/auth-context';

export default function Login() {
  const router = useRouter();
  const { sendOtp } = useAuth();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 10) {
      setError('Enter a valid phone number');
      return;
    }
    const fullPhone = cleaned.startsWith('+') ? cleaned : `+91${cleaned}`;
    setError('');
    setLoading(true);
    try {
      await sendOtp(fullPhone);
      router.push({ pathname: '/(auth)/otp', params: { phone: fullPhone } });
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not send OTP. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.content}>
          <View style={styles.logoRow}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>HS</Text>
            </View>
            <Text style={styles.brand}>HomeServe Pro</Text>
          </View>

          <Text style={styles.heading}>Welcome, partner</Text>
          <Text style={styles.subheading}>
            Sign in with your registered phone number to see and manage your jobs.
          </Text>

          <View style={{ marginTop: spacing.xxl }}>
            <Input
              label="Phone number"
              leftIcon="call-outline"
              placeholder="98765 43210"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                if (error) setError('');
              }}
              error={error}
              maxLength={10}
            />
          </View>

          <Button title="Continue" onPress={handleContinue} loading={loading} />

          <Text style={styles.terms}>
            New here? Just enter your phone number — we'll set up your worker account and guide you through
            registration.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xxxl, gap: spacing.md },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: colors.white, fontWeight: fontWeight.extrabold, fontSize: fontSize.md },
  brand: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  heading: { fontSize: fontSize.xxxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: spacing.sm },
  subheading: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 21 },
  terms: { marginTop: spacing.xxl, textAlign: 'center', color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 18 },
});