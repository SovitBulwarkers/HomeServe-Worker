import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Card, EmptyState, Input } from '../../src/components/ui';
import Button from '../../src/components/Button';
import { WalletAPI, WorkerWallet, Transaction, Earning } from '../../src/api/endpoints';
import SettleDebtModal from '../../src/components/SettleDebtModal';

type Period = 'today' | 'week' | 'month';

function formatTxDescription(rawDesc: string) {
  if (!rawDesc) return { title: '', holdDate: null };
  const heldUntilMatch = rawDesc.match(/\s*\(held until ([^)]+)\)/i);
  if (heldUntilMatch) {
    const cleanDesc = rawDesc.replace(heldUntilMatch[0], '').trim();
    const dateObj = new Date(heldUntilMatch[1]);
    let formattedHoldDate = '';
    if (!isNaN(dateObj.getTime())) {
      formattedHoldDate = dateObj.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } else {
      formattedHoldDate = heldUntilMatch[1];
    }
    return {
      title: cleanDesc,
      holdDate: formattedHoldDate,
    };
  }
  return {
    title: rawDesc,
    holdDate: null,
  };
}

export default function Earnings() {
  const router = useRouter();
  const [wallet, setWallet] = useState<WorkerWallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [period, setPeriod] = useState<Period>('week');
  const [summary, setSummary] = useState<{ netEarnings: number; totalJobs: number; earnings: Earning[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [reserved, setReserved] = useState(0);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const [walletRes, txRes, earnRes, withdrawalsRes] = await Promise.all([
        WalletAPI.getWallet(),
        WalletAPI.getTransactions(1, 20),
        WalletAPI.getEarnings(p),
        WalletAPI.getWithdrawals(1, 50),
      ]);
      setWallet(walletRes.data.data ?? null);
      const txData: any = txRes.data;
      setTransactions(txData.data?.transactions ?? txData.data ?? []);
      setSummary(earnRes.data.data ?? null);
      const withdrawals = withdrawalsRes.data.data?.withdrawals ?? [];
      const reservedSum = withdrawals
        .filter((w) => w.status === 'PENDING' || w.status === 'PROCESSING')
        .reduce((sum, w) => sum + Number(w.amount), 0);
      setReserved(reservedSum);
    } catch {
      // Non-fatal — shows zero state.
    } finally {
      setLoading(false);
    }
  }, []);

  const available = wallet ? Math.max(0, Number(wallet.balance) - reserved) : 0;

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
    if (amount > available) {
      Alert.alert(
        'Insufficient available balance',
        reserved > 0
          ? `You have ₹${reserved.toFixed(0)} tied up in a withdrawal that's already in progress. You can withdraw up to ₹${available.toFixed(0)} right now.`
          : 'You cannot withdraw more than your available balance.',
      );
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
              <Text style={styles.balanceLabel}>Available to withdraw</Text>
              <Text style={styles.balanceValue}>₹{available.toFixed(2)}</Text>
              {reserved > 0 && (
                <Text style={styles.balanceSubnote}>₹{reserved.toFixed(0)} already in a withdrawal in progress</Text>
              )}
              {!!wallet && wallet.pendingBalance > 0 && (
                <Text style={styles.balanceSubnote}>
                  + ₹{wallet.pendingBalance.toFixed(0)} settling from recent jobs — moves here automatically once cleared
                </Text>
              )}
              <Button title="Withdraw to bank" onPress={() => setWithdrawOpen(true)} size="sm" style={{ marginTop: spacing.md }} />
            </Card>

            {wallet && wallet.commissionDebt > 0 && (
              <Card style={styles.debtCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Ionicons name="alert-circle" size={20} color={colors.danger} />
                  <Text style={styles.debtTitle}>Cash commission owed</Text>
                </View>
                <Text style={styles.debtSubtitle}>
                  You collected cash on a job — ₹{wallet.commissionDebt.toFixed(0)} in commission is
                  owed to HomeServe. Settle it now or it'll be deducted from your next digital-payment
                  earnings.
                </Text>
                <Button title="Settle Now" onPress={() => setSettleOpen(true)} size="sm" style={{ marginTop: spacing.md }} />
              </Card>
            )}

            <View style={styles.quickLinksRow}>
              <Pressable style={styles.quickLink} onPress={() => router.push('/earnings/monthly-statement')}>
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                <Text style={styles.quickLinkText}>Monthly statement</Text>
              </Pressable>
              <Pressable style={styles.quickLink} onPress={() => router.push('/earnings/withdrawals')}>
                <Ionicons name="swap-vertical-outline" size={20} color={colors.primary} />
                <Text style={styles.quickLinkText}>Withdrawal history</Text>
              </Pressable>
              <Pressable style={styles.quickLink} onPress={() => router.push('/earnings/history')}>
                <Ionicons name="list-outline" size={20} color={colors.primary} />
                <Text style={styles.quickLinkText}>Per-booking earnings</Text>
              </Pressable>
            </View>

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
        renderItem={({ item }) => {
          const { title, holdDate } = formatTxDescription(item.description);
          return (
            <Card style={styles.txCard}>
              <View style={[styles.txIcon, { backgroundColor: item.type === 'CREDIT' ? colors.successLight : colors.dangerLight }]}>
                <Ionicons
                  name={item.type === 'CREDIT' ? 'arrow-down-outline' : 'arrow-up-outline'}
                  size={18}
                  color={item.type === 'CREDIT' ? colors.success : colors.danger}
                />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.txDesc}>{title}</Text>
                {holdDate ? (
                  <View style={styles.holdBadge}>
                    <Ionicons name="time-outline" size={12} color={colors.warning} />
                    <Text style={styles.holdText}>Clears on {holdDate}</Text>
                  </View>
                ) : null}
                <Text style={styles.txDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
              </View>
              <Text style={[styles.txAmount, { color: item.type === 'CREDIT' ? colors.success : colors.danger }]}>
                {item.type === 'CREDIT' ? '+' : '-'}₹{item.amount.toFixed(0)}
              </Text>
            </Card>
          );
        }}
      />

      <Modal visible={withdrawOpen} transparent animationType="slide" onRequestClose={() => setWithdrawOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Withdraw earnings</Text>
            <Text style={styles.modalSubtitle}>Available balance: ₹{available.toFixed(2)}</Text>
            <Input placeholder="Amount" keyboardType="number-pad" value={withdrawAmount} onChangeText={setWithdrawAmount} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button title="Cancel" variant="outline" onPress={() => setWithdrawOpen(false)} style={{ flex: 1 }} />
              <Button title="Confirm" onPress={submitWithdraw} loading={withdrawing} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SettleDebtModal
        visible={settleOpen}
        owed={wallet ? wallet.commissionDebt : 0}
        onClose={() => setSettleOpen(false)}
        onSettled={(remainingCommissionDebt) => {
          setSettleOpen(false);
          setWallet((w) => (w ? { ...w, commissionDebt: remainingCommissionDebt } : w));
          Alert.alert('Settled', 'Your cash commission has been cleared.');
          load(period);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  heading: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary, paddingHorizontal: spacing.xxl, paddingTop: spacing.md },
  list: { padding: spacing.xxl, paddingTop: spacing.md, gap: spacing.sm },
  balanceCard: { marginTop: spacing.lg, alignItems: 'center' },
  debtCard: { marginTop: spacing.md, backgroundColor: colors.dangerLight, borderWidth: 1, borderColor: colors.danger },
  debtTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary },
  debtSubtitle: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },
  balanceLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  balanceValue: { fontSize: fontSize.display, fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginTop: 4 },
  balanceSubnote: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4, textAlign: 'center' },
  quickLinksRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  quickLink: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xs },
  quickLinkText: { fontSize: 11, fontWeight: fontWeight.semibold, color: colors.textPrimary, textAlign: 'center' },
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
  holdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 2,
  },
  holdText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.warning,
  },
  txDate: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xxl, gap: spacing.md },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
});