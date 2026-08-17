import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../../src/theme';
import { Card, StatusPill, EmptyState } from '../../src/components/ui';
import { DisputesAPI, Dispute } from '../../src/api/endpoints';
import { disputeReasonLabel, disputeStatusLabel, disputeStatusTone, OPEN_DISPUTE_STATUSES } from '../../src/constants/disputes';

type Tab = 'ACTIVE' | 'RESOLVED';

export default function DisputesList() {
  const router = useRouter();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('ACTIVE');

  const load = useCallback(async () => {
    try {
      const { data } = await DisputesAPI.myDisputes(1, 50);
      setDisputes(data.data?.disputes ?? []);
    } catch {
      setDisputes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(
    () =>
      disputes.filter((d) =>
        tab === 'ACTIVE' ? OPEN_DISPUTE_STATUSES.includes(d.status) : !OPEN_DISPUTE_STATUSES.includes(d.status),
      ),
    [disputes, tab],
  );

  const activeCount = disputes.filter((d) => OPEN_DISPUTE_STATUSES.includes(d.status)).length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Disputes</Text>
        <Pressable onPress={() => router.push('/disputes/new')} style={[styles.backBtn, { backgroundColor: colors.primary }]}>
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        {(['ACTIVE', 'RESOLVED'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tabBtn, tab === t && styles.tabBtnActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'ACTIVE' ? 'Active' : 'Resolved'}
            </Text>
            {t === 'ACTIVE' && activeCount > 0 ? (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{activeCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="shield-checkmark-outline"
              title={tab === 'ACTIVE' ? 'No active disputes' : 'No resolved disputes yet'}
              subtitle={
                tab === 'ACTIVE'
                  ? 'Raise a dispute if a charge or refund on a job looks wrong.'
                  : 'Resolved and withdrawn disputes will show up here.'
              }
            />
          }
          renderItem={({ item }) => (
            <Card onPress={() => router.push({ pathname: '/disputes/[id]', params: { id: item.id } })}>
              <View style={styles.rowTop}>
                <View style={styles.reasonIconWrap}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.reason}>{disputeReasonLabel(item.reason)}</Text>
                  <Text style={styles.bookingNumber}>
                    #{item.booking?.bookingNumber ?? item.bookingId.slice(0, 8)}
                  </Text>
                </View>
                <StatusPill label={disputeStatusLabel(item.status)} tone={disputeStatusTone(item.status)} />
              </View>
              <Text style={styles.description} numberOfLines={2}>
                {item.description}
              </Text>
              <View style={styles.rowBottom}>
                {item.amountClaimed ? (
                  <Text style={styles.amount}>₹{Number(item.amountClaimed).toFixed(0)} claimed</Text>
                ) : (
                  <View />
                )}
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
              </View>
            </Card>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.subtle },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  tabRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xxl, marginBottom: spacing.md },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  tabBadge: { backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: radius.pill, paddingHorizontal: 6, minWidth: 18, alignItems: 'center' },
  tabBadgeText: { fontSize: 11, fontWeight: fontWeight.bold, color: colors.white },
  list: { padding: spacing.xxl, paddingTop: 0, flexGrow: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  reasonIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  reason: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  bookingNumber: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  description: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.primary },
  date: { fontSize: fontSize.xs, color: colors.textMuted },
});
