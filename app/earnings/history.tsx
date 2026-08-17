import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Card, EmptyState } from '../../src/components/ui';
import { WalletAPI, Earning } from '../../src/api/endpoints';

type Period = 'today' | 'week' | 'month';

export default function EarningsHistory() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('month');
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [totals, setTotals] = useState<{ netEarnings: number; totalJobs: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const res = await WalletAPI.getEarnings(p);
      setEarnings(res.data.data?.earnings ?? []);
      setTotals({
        netEarnings: res.data.data?.netEarnings ?? 0,
        totalJobs: res.data.data?.totalJobs ?? 0,
      });
    } catch {
      setEarnings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(period);
    }, [period, load]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Earnings history</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        ListHeaderComponent={
          <View>
            <View style={styles.periodRow}>
              {(['today', 'week', 'month'] as Period[]).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPeriod(p)}
                  style={[styles.periodBtn, period === p && styles.periodBtnActive]}
                >
                  <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                    {p === 'today' ? 'Today' : p === 'week' ? 'This week' : 'This month'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {!loading && totals && (
              <View style={styles.summaryRow}>
                <Card style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>₹{totals.netEarnings.toFixed(0)}</Text>
                  <Text style={styles.summaryLabel}>Net earnings</Text>
                </Card>
                <Card style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{totals.totalJobs}</Text>
                  <Text style={styles.summaryLabel}>Jobs completed</Text>
                </Card>
              </View>
            )}

            <Text style={styles.sectionTitle}>Per-booking breakdown</Text>
          </View>
        }
        data={earnings}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="cash-outline" title="No earnings in this period" />
          ) : (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.earningCard}>
            <View style={[styles.earningIcon]}>
              <Ionicons name="briefcase-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.earningTitle}>
                {item.bookingId ? `Booking #${item.bookingId.slice(-6).toUpperCase()}` : 'Earning'}
              </Text>
              <Text style={styles.earningDate}>{new Date(item.date).toLocaleDateString()}</Text>
              <Text style={styles.earningBreakdown}>
                Gross ₹{item.amount.toFixed(0)} · Commission ₹{item.commission.toFixed(0)}
              </Text>
            </View>
            <Text style={styles.earningNet}>+₹{item.netAmount.toFixed(0)}</Text>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  list: { padding: spacing.xxl, paddingTop: 0, gap: spacing.sm },
  periodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  periodBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.surfaceMuted },
  periodBtnActive: { backgroundColor: colors.primary },
  periodText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  periodTextActive: { color: colors.white },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  summaryValue: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.sm },
  earningCard: { flexDirection: 'row', alignItems: 'center' },
  earningIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  earningTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  earningDate: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  earningBreakdown: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  earningNet: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.success },
});
