import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Card, EmptyState, Input } from '../../src/components/ui';
import Button from '../../src/components/Button';
import { WalletAPI, WorkerWallet, Transaction, Earning } from '../../src/api/endpoints';

type Period = 'today' | 'week' | 'month';

export default function Earnings() {
  const [wallet, setWallet] = useState<WorkerWallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [period, setPeriod] = useState<Period>('week');
  const [summary, setSummary] = useState<{ netEarnings: number; totalJobs: number; earnings: Earning[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const [walletRes, txRes, earnRes] = await Promise.all([
        WalletAPI.getWallet(),
        WalletAPI.getTransactions(1, 20),
        WalletAPI.getEarnings(p),
      ]);
      setWallet(walletRes.data.data ?? null);
      const txData: any = txRes.data;
      setTransactions(txData.data?.transactions ?? txData.data ?? []);
      setSummary(earnRes.data.data ?? null);
    } catch {
      // Non-fatal — shows zero state.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(period);
    }, [period, load]),
  );

  const submitWithdraw = async () => {
    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Enter a valid amount');
      return;
    }
    if (wallet && amount > wallet.balance) {
      Alert.alert('Insufficient balance', 'You cannot withdraw more than your wallet balance.');
      return;
    }
    setWithdrawing(true);
    try {
      await WalletAPI.withdraw(amount);
      setWithdrawOpen(false);
      setWithdrawAmount('');
      Alert.alert('Withdrawal requested', 'Your payout has been requested and will reflect in your bank account shortly.');
      await load(period);
    } catch (e: any) {
      Alert.alert('Could not withdraw', e?.response?.data?.message || 'Please try again.');
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        ListHeaderComponent={
          <View>
            <Text style={styles.heading}>Earnings</Text>

            <Card style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Wallet balance</Text>
              <Text style={styles.balanceValue}>₹{(wallet?.balance ?? 0).toFixed(2)}</Text>
              <Button title="Withdraw to bank" onPress={() => setWithdrawOpen(true)} size="sm" style={{ marginTop: spacing.md }} />
            </Card>

            <View style={styles.periodRow}>
              {(['today', 'week', 'month'] as Period[]).map((p) => (
                <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.periodBtn, period === p && styles.periodBtnActive]}>
                  <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                    {p === 'today' ? 'Today' : p === 'week' ? 'This week' : 'This month'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
            ) : (
              <View style={styles.summaryRow}>
                <Card style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>₹{(summary?.netEarnings ?? 0).toFixed(0)}</Text>
                  <Text style={styles.summaryLabel}>Net earnings</Text>
                </Card>
                <Card style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{summary?.totalJobs ?? 0}</Text>
                  <Text style={styles.summaryLabel}>Jobs completed</Text>
                </Card>
              </View>
            )}

            <Text style={styles.sectionTitle}>Recent transactions</Text>
          </View>
        }
        data={transactions}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={!loading ? <EmptyState icon="receipt-outline" title="No transactions yet" /> : null}
        renderItem={({ item }) => (
          <Card style={styles.txCard}>
            <View style={[styles.txIcon, { backgroundColor: item.type === 'CREDIT' ? colors.successLight : colors.dangerLight }]}>
              <Ionicons
                name={item.type === 'CREDIT' ? 'arrow-down-outline' : 'arrow-up-outline'}
                size={18}
                color={item.type === 'CREDIT' ? colors.success : colors.danger}
              />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.txDesc}>{item.description}</Text>
              <Text style={styles.txDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </View>
            <Text style={[styles.txAmount, { color: item.type === 'CREDIT' ? colors.success : colors.danger }]}>
              {item.type === 'CREDIT' ? '+' : '-'}₹{item.amount.toFixed(0)}
            </Text>
          </Card>
        )}
      />

      <Modal visible={withdrawOpen} transparent animationType="slide" onRequestClose={() => setWithdrawOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Withdraw earnings</Text>
            <Text style={styles.modalSubtitle}>Available balance: ₹{(wallet?.balance ?? 0).toFixed(2)}</Text>
            <Input placeholder="Amount" keyboardType="number-pad" value={withdrawAmount} onChangeText={setWithdrawAmount} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button title="Cancel" variant="outline" onPress={() => setWithdrawOpen(false)} style={{ flex: 1 }} />
              <Button title="Confirm" onPress={submitWithdraw} loading={withdrawing} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  heading: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary, paddingHorizontal: spacing.xxl, paddingTop: spacing.md },
  list: { padding: spacing.xxl, paddingTop: spacing.md, gap: spacing.sm },
  balanceCard: { marginTop: spacing.lg, alignItems: 'center' },
  balanceLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  balanceValue: { fontSize: fontSize.display, fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginTop: 4 },
  periodRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  periodBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.surfaceMuted },
  periodBtnActive: { backgroundColor: colors.primary },
  periodText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  periodTextActive: { color: colors.white },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  summaryValue: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm },
  txCard: { flexDirection: 'row', alignItems: 'center' },
  txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  txDesc: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  txDate: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xxl, gap: spacing.md },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
});