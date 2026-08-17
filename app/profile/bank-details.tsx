import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing } from '../../src/theme';
import { Card, Input, StatusPill } from '../../src/components/ui';
import Button from '../../src/components/Button';
import { useAuth } from '../../src/store/auth-context';
import { WorkerAPI, BankVerificationStatus } from '../../src/api/endpoints';

function verificationTone(status?: BankVerificationStatus): 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'VERIFIED':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'FAILED':
      return 'danger';
    default:
      return 'info';
  }
}

function verificationLabel(status?: BankVerificationStatus): string {
  switch (status) {
    case 'VERIFIED':
      return 'Verified';
    case 'PENDING':
      return 'Verification pending';
    case 'FAILED':
      return 'Verification failed';
    default:
      return 'Not verified';
  }
}

export default function BankDetails() {
  const router = useRouter();
  const { worker, refreshWorker } = useAuth();
  const [accountName, setAccountName] = useState(worker?.bankDetail?.accountName ?? '');
  const [accountNumber, setAccountNumber] = useState(worker?.bankDetail?.accountNumber ?? '');
  const [ifscCode, setIfscCode] = useState(worker?.bankDetail?.ifscCode ?? '');
  const [bankName, setBankName] = useState(worker?.bankDetail?.bankName ?? '');
  const [upiId, setUpiId] = useState(worker?.bankDetail?.upiId ?? '');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const verificationStatus = worker?.bankDetail?.verificationStatus;
  const hasBankDetail = !!worker?.bankDetail;

  useEffect(() => {
    // Values are seeded from the auth context; refresh once in case the
    // worker profile hasn't been fetched with bank details yet.
    if (!worker?.bankDetail) {
      setLoading(true);
      refreshWorker().finally(() => setLoading(false));
    }
  }, []);

  const save = async () => {
    if (!accountName.trim() || !accountNumber.trim() || !ifscCode.trim() || !bankName.trim()) {
      Alert.alert('Missing details', 'Please fill in account name, number, IFSC, and bank name.');
      return;
    }
    setSaving(true);
    try {
      await WorkerAPI.updateBankDetails({
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim().toUpperCase(),
        bankName: bankName.trim(),
        upiId: upiId.trim() || undefined,
      });
      await refreshWorker();
      Alert.alert('Saved', 'Your bank details have been updated.');
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e?.response?.data?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const requestVerification = async () => {
    setVerifying(true);
    try {
      const res = await WorkerAPI.requestBankVerification();
      await refreshWorker();
      Alert.alert('Verification', res.data.message || 'Verification requested.');
    } catch (e: any) {
      Alert.alert('Could not request verification', e?.response?.data?.message || 'Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Bank details</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>Your earnings withdrawals are sent to this account.</Text>

          {hasBankDetail && (
            <Card style={styles.verifyCard}>
              <View style={styles.verifyRow}>
                <Text style={styles.verifyTitle}>Verification status</Text>
                <StatusPill label={verificationLabel(verificationStatus)} tone={verificationTone(verificationStatus)} />
              </View>
              {verificationStatus === 'FAILED' && worker?.bankDetail?.verificationFailReason && (
                <Text style={styles.verifyFailReason}>{worker.bankDetail.verificationFailReason}</Text>
              )}
              {verificationStatus !== 'VERIFIED' && verificationStatus !== 'PENDING' && (
                <>
                  <Text style={styles.verifySubtitle}>
                    Withdrawals are only allowed once your bank account is verified.
                  </Text>
                  <Button
                    title="Request verification"
                    variant="secondary"
                    size="sm"
                    onPress={requestVerification}
                    loading={verifying}
                    style={{ marginTop: spacing.md }}
                  />
                </>
              )}
              {verificationStatus === 'PENDING' && (
                <Text style={styles.verifySubtitle}>
                  Your verification is under review. You'll be notified once it's confirmed.
                </Text>
              )}
            </Card>
          )}

          <Input label="Account holder name" value={accountName} onChangeText={setAccountName} />
          <Input label="Account number" value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" />
          <Input label="IFSC code" value={ifscCode} onChangeText={setIfscCode} autoCapitalize="characters" />
          <Input label="Bank name" value={bankName} onChangeText={setBankName} />
          <Input label="UPI ID (optional)" value={upiId} onChangeText={setUpiId} autoCapitalize="none" />
          <Button title="Save bank details" onPress={save} loading={saving} style={{ marginTop: spacing.md }} />
        </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  content: { padding: spacing.xxl, paddingBottom: spacing.xxxl * 2 },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xl },
  verifyCard: { marginBottom: spacing.xl },
  verifyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  verifyTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary },
  verifySubtitle: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.sm },
  verifyFailReason: { fontSize: fontSize.xs, color: colors.danger, marginTop: spacing.sm },
});