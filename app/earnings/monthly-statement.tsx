import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Card, EmptyState } from '../../src/components/ui';
import { WalletAPI, MonthlyStatement } from '../../src/api/endpoints';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function MonthlyStatementScreen() {
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [statement, setStatement] = useState<MonthlyStatement | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (m: number, y: number) => {
    setLoading(true);
    try {
      const res = await WalletAPI.getMonthlyStatement(m, y);
      setStatement(res.data.data ?? null);
    } catch {
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(month, year);
    }, [month, year, load]),
  );

  const goPrev = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const goNext = () => {
    if (isCurrentMonth) return;
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Monthly statement</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.monthSwitcher}>
        <Pressable onPress={goPrev} style={styles.monthArrow}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.monthLabel}>{MONTH_NAMES[month - 1]} {year}</Text>
        <Pressable onPress={goNext} style={styles.monthArrow} disabled={isCurrentMonth}>
          <Ionicons name="chevron-forward" size={20} color={isCurrentMonth ? colors.textMuted : colors.textPrimary} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : !statement ? (
        <EmptyState icon="document-text-outline" title="Couldn't load statement" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{statement.jobsCompleted}</Text>
              <Text style={styles.summaryLabel}>Jobs completed</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryValue}>₹{statement.netEarnings.toFixed(0)}</Text>
              <Text style={styles.summaryLabel}>Net earnings</Text>
            </Card>
          </View>

          <Card style={styles.detailCard}>
            <Row label="Gross earnings" value={`₹${statement.grossEarnings.toFixed(2)}`} />
            <Row label="Commission charged" value={`-₹${statement.commissionCharged.toFixed(2)}`} valueColor={colors.danger} />
            <Row label="Net earnings" value={`₹${statement.netEarnings.toFixed(2)}`} bold />
            <View style={styles.divider} />
            <Row label="Paid out to bank" value={`₹${statement.totalPaidOut.toFixed(2)}`} />
            {statement.totalDebtSettled > 0 && (
              <Row label="Cash commission settled" value={`₹${statement.totalDebtSettled.toFixed(2)}`} />
            )}
            <View style={styles.divider} />
            <Row label="Current wallet balance" value={`₹${statement.currentBalance.toFixed(2)}`} bold />
            {statement.currentCommissionDebt !== 0 && (
              <Row
                label="Outstanding commission debt"
                value={`₹${Math.abs(statement.currentCommissionDebt).toFixed(2)}`}
                valueColor={colors.danger}
              />
            )}
          </Card>

          <Text style={styles.sectionTitle}>Payouts this month</Text>
          {statement.withdrawals.length === 0 ? (
            <EmptyState icon="cash-outline" title="No payouts this month" />
          ) : (
            statement.withdrawals.map((w) => (
              <Card key={w.id} style={styles.payoutCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payoutBank}>{w.bankName} ****{w.accountLast4}</Text>
                  <Text style={styles.payoutDate}>
                    {new Date(w.completedAt || w.requestedAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.payoutAmount}>₹{w.amount.toFixed(0)}</Text>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  bold,
  valueColor,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          bold && { fontWeight: fontWeight.extrabold },
          valueColor ? { color: valueColor } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  monthSwitcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl, paddingBottom: spacing.md },
  monthArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, minWidth: 150, textAlign: 'center' },
  content: { padding: spacing.xxl, paddingTop: 0, paddingBottom: spacing.xxxl * 2 },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  summaryValue: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
  detailCard: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  rowLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  rowValue: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm },
  payoutCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  payoutBank: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  payoutDate: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  payoutAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.success },
});
