import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing } from '../../src/theme';
import { Card, EmptyState, StatusPill } from '../../src/components/ui';
import { WalletAPI, Withdrawal, WithdrawalStatus } from '../../src/api/endpoints';

function statusTone(status: WithdrawalStatus): 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'PROCESSING':
      return 'info';
    default:
      return 'warning';
  }
}

function statusLabel(status: WithdrawalStatus): string {
  switch (status) {
    case 'COMPLETED':
      return 'Completed';
    case 'FAILED':
      return 'Failed';
    case 'PROCESSING':
      return 'Processing';
    default:
      return 'Pending';
  }
}

export default function WithdrawalHistory() {
  const router = useRouter();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await WalletAPI.getWithdrawals(1, 50);
      setWithdrawals(res.data.data?.withdrawals ?? []);
    } catch {
      setWithdrawals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Withdrawal history</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={withdrawals}
          keyExtractor={(w) => w.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="wallet-outline" title="No withdrawals yet" subtitle="Payouts you request will show up here." />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/earnings/withdrawal/[id]', params: { id: item.id, data: JSON.stringify(item) } })
              }
            >
            <Card style={styles.card}>
              <View style={styles.rowTop}>
                <Text style={styles.amount}>₹{item.amount.toFixed(0)}</Text>
                <StatusPill label={statusLabel(item.status)} tone={statusTone(item.status)} />
              </View>
              <Text style={styles.bank}>
                {item.bankName} ****{item.accountLast4}
              </Text>
              <Text style={styles.date}>Requested {new Date(item.requestedAt).toLocaleString()}</Text>
              {item.completedAt && (
                <Text style={styles.date}>Completed {new Date(item.completedAt).toLocaleString()}</Text>
              )}
              {item.status === 'FAILED' && item.failureReason && (
                <Text style={styles.failure}>{item.failureReason}</Text>
              )}
              <View style={styles.detailLinkRow}>
                <Text style={styles.detailLinkText}>View settlement details</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </View>
            </Card>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  list: { padding: spacing.xxl, paddingTop: 0, gap: spacing.sm },
  card: { gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amount: { fontSize: fontSize.lg, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  bank: { fontSize: fontSize.sm, color: colors.textSecondary },
  date: { fontSize: fontSize.xs, color: colors.textMuted },
  failure: { fontSize: fontSize.xs, color: colors.danger, marginTop: 2 },
  detailLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, marginTop: 4 },
  detailLinkText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold },
});
