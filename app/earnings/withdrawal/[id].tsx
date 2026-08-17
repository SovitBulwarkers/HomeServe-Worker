import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../../../src/theme';
import { Card, StatusPill } from '../../../src/components/ui';
import { WalletAPI, Withdrawal, WithdrawalStatus } from '../../../src/api/endpoints';

/**
 * There's no dedicated GET /wallet/worker/withdrawals/:id on the backend —
 * the list endpoint (`WalletAPI.getWithdrawals`) already returns every
 * field this screen needs (razorpayxPayoutId, payoutStatus, failureReason,
 * etc — see Withdrawal in api/endpoints.ts). The withdrawals list screen
 * passes the tapped row's data through as a route param so this screen has
 * something to paint instantly — but that's a snapshot from the moment the
 * user tapped, not live data. A payout can move PENDING → PROCESSING →
 * COMPLETED/FAILED (RazorpayX processes it async — see OutboxService and
 * WalletService.withdrawMoney) at any point after that tap, including
 * while this exact screen is open, so it re-fetches the list and finds
 * this withdrawal by id on every focus (and on pull-to-refresh) rather
 * than trusting the param forever.
 */

// Bounded search: most withdrawals people tap into are recent, so check a
// few pages before giving up rather than paging through someone's entire
// history looking for one id.
const MAX_SEARCH_PAGES = 5;
const PAGE_SIZE = 20;

async function findWithdrawal(id: string): Promise<Withdrawal | null> {
  for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
    const { data } = await WalletAPI.getWithdrawals(page, PAGE_SIZE);
    const withdrawals = data.data?.withdrawals ?? [];
    const found = withdrawals.find((w) => w.id === id);
    if (found) return found;
    const total = data.data?.total ?? 0;
    if (page * PAGE_SIZE >= total) break;
  }
  return null;
}

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

// RazorpayX's own payout-status vocabulary, distinct from our coarser
// WithdrawalStatus. Used to build the settlement lifecycle timeline.
type RpxStage = 'queued' | 'processing' | 'processed' | 'reversed' | 'rejected' | 'failed';

const RPX_STAGE_META: Record<RpxStage, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  queued: { label: 'Queued with RazorpayX', icon: 'time-outline' },
  processing: { label: 'Processing at bank', icon: 'sync-outline' },
  processed: { label: 'Processed — funds sent', icon: 'checkmark-circle-outline' },
  reversed: { label: 'Reversed by bank', icon: 'return-up-back-outline' },
  rejected: { label: 'Rejected by RazorpayX', icon: 'close-circle-outline' },
  failed: { label: 'Failed', icon: 'alert-circle-outline' },
};

function buildTimeline(w: Withdrawal) {
  // Always-present first step.
  const steps: { label: string; icon: keyof typeof Ionicons.glyphMap; done: boolean; timestamp?: string | null; tone: 'default' | 'success' | 'danger' }[] = [
    { label: 'Withdrawal requested', icon: 'paper-plane-outline', done: true, timestamp: w.requestedAt, tone: 'default' },
  ];

  const rpxStage = (w.payoutStatus || '').toLowerCase() as RpxStage;
  const terminal = ['reversed', 'rejected', 'failed'].includes(rpxStage) || w.status === 'FAILED';

  if (w.razorpayxPayoutId) {
    steps.push({
      label: 'Sent to RazorpayX for payout',
      icon: 'send-outline',
      done: true,
      timestamp: null,
      tone: 'default',
    });
  }

  if (rpxStage && RPX_STAGE_META[rpxStage]) {
    const meta = RPX_STAGE_META[rpxStage];
    steps.push({
      label: meta.label,
      icon: meta.icon,
      done: true,
      timestamp: null,
      tone: terminal ? 'danger' : 'default',
    });
  } else if (!terminal && w.status === 'PENDING') {
    steps.push({ label: 'Awaiting payout initiation', icon: 'hourglass-outline', done: false, timestamp: null, tone: 'default' });
  }

  if (w.status === 'COMPLETED') {
    steps.push({
      label: 'Credited to bank account',
      icon: 'checkmark-done-circle-outline',
      done: true,
      timestamp: w.completedAt,
      tone: 'success',
    });
  } else if (w.status === 'FAILED') {
    steps.push({
      label: w.failureReason ? `Failed — ${w.failureReason}` : 'Failed',
      icon: 'close-circle-outline',
      done: true,
      timestamp: w.completedAt,
      tone: 'danger',
    });
  } else {
    steps.push({ label: 'Credited to bank account', icon: 'checkmark-done-circle-outline', done: false, timestamp: null, tone: 'default' });
  }

  return steps;
}

export default function WithdrawalDetail() {
  const router = useRouter();
  const { id, data } = useLocalSearchParams<{ id: string; data?: string }>();

  const paramWithdrawal: Withdrawal | null = useMemo(() => {
    if (!data) return null;
    try {
      return JSON.parse(data) as Withdrawal;
    } catch {
      return null;
    }
  }, [data]);

  const [withdrawal, setWithdrawal] = useState<Withdrawal | null>(paramWithdrawal);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(
    async (showSpinner: boolean) => {
      if (!id) return;
      if (showSpinner) setRefreshing(true);
      try {
        const fresh = await findWithdrawal(id);
        if (fresh) {
          setWithdrawal(fresh);
          setNotFound(false);
        } else if (!paramWithdrawal) {
          // Never found it anywhere, and we had no fallback to show either.
          setNotFound(true);
        }
        // If it wasn't found but we still have the param snapshot, keep
        // showing that rather than blanking the screen — it just means
        // this withdrawal fell past MAX_SEARCH_PAGES, not that it's gone.
      } catch {
        // Non-fatal — keep whatever's currently on screen (param snapshot
        // or the last successful fetch) and let the user pull to retry.
      } finally {
        if (showSpinner) setRefreshing(false);
      }
    },
    [id, paramWithdrawal],
  );

  // Instant paint from the param, then always go get the live state —
  // it may already be stale by the time the user tapped this row.
  useEffect(() => {
    refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]),
  );

  if (!withdrawal) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Settlement details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ padding: spacing.xxl }}>
          <Text style={{ color: colors.textSecondary }}>
            {notFound
              ? "Couldn't find this withdrawal. Go back and try opening it again."
              : 'Loading the latest status…'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const timeline = buildTimeline(withdrawal);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Settlement details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} tintColor={colors.primary} />
        }
      >
        <Card style={styles.summaryCard}>
          <Text style={styles.amount}>₹{withdrawal.amount.toFixed(0)}</Text>
          <StatusPill label={statusLabel(withdrawal.status)} tone={statusTone(withdrawal.status)} />
          <Text style={styles.bank}>
            {withdrawal.bankName} ****{withdrawal.accountLast4} · {withdrawal.ifscCode}
          </Text>
        </Card>

        <Text style={styles.sectionTitle}>Settlement timeline</Text>
        <Card style={styles.timelineCard}>
          {timeline.map((step, i) => (
            <View key={i} style={styles.timelineRow}>
              <View style={styles.timelineIconCol}>
                <View
                  style={[
                    styles.timelineDot,
                    step.done && step.tone === 'success' && styles.timelineDotSuccess,
                    step.done && step.tone === 'danger' && styles.timelineDotDanger,
                    step.done && step.tone === 'default' && styles.timelineDotDone,
                  ]}
                >
                  <Ionicons
                    name={step.icon}
                    size={14}
                    color={step.done ? colors.white : colors.textMuted}
                  />
                </View>
                {i < timeline.length - 1 && (
                  <View style={[styles.timelineLine, step.done && styles.timelineLineDone]} />
                )}
              </View>
              <View style={styles.timelineTextCol}>
                <Text style={[styles.timelineLabel, !step.done && styles.timelineLabelPending]}>
                  {step.label}
                </Text>
                {step.timestamp && (
                  <Text style={styles.timelineTimestamp}>{new Date(step.timestamp).toLocaleString()}</Text>
                )}
              </View>
            </View>
          ))}
        </Card>

        <Text style={styles.sectionTitle}>RazorpayX reference</Text>
        <Card style={styles.refCard}>
          <RefRow label="Payout ID" value={withdrawal.razorpayxPayoutId} />
          <RefRow label="Payout reference" value={withdrawal.payoutRef} />
          <RefRow label="RazorpayX status" value={withdrawal.payoutStatus ? withdrawal.payoutStatus.toUpperCase() : undefined} />
          {withdrawal.status === 'FAILED' && (
            <RefRow label="Failure reason" value={withdrawal.failureReason} danger />
          )}
          {!withdrawal.razorpayxPayoutId && (
            <Text style={styles.noRefNote}>
              No payout reference yet — this withdrawal hasn't been sent to RazorpayX for processing.
            </Text>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function RefRow({ label, value, danger }: { label: string; value?: string | null; danger?: boolean }) {
  if (!value) return null;
  return (
    <View style={styles.refRow}>
      <Text style={styles.refLabel}>{label}</Text>
      <Text style={[styles.refValue, danger && { color: colors.danger }]} numberOfLines={2}>
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
  scroll: { padding: spacing.xxl, paddingTop: 0, gap: spacing.lg },
  summaryCard: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  amount: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  bank: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: -spacing.sm },
  timelineCard: { paddingVertical: spacing.lg },
  timelineRow: { flexDirection: 'row' },
  timelineIconCol: { alignItems: 'center', width: 32 },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotDone: { backgroundColor: colors.primary },
  timelineDotSuccess: { backgroundColor: colors.success },
  timelineDotDanger: { backgroundColor: colors.danger },
  timelineLine: { width: 2, flex: 1, minHeight: 24, backgroundColor: colors.borderLight, marginVertical: 2 },
  timelineLineDone: { backgroundColor: colors.primary },
  timelineTextCol: { flex: 1, paddingBottom: spacing.lg, paddingLeft: spacing.sm },
  timelineLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  timelineLabelPending: { color: colors.textMuted, fontWeight: fontWeight.medium },
  timelineTimestamp: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  refCard: { gap: spacing.md },
  refRow: { gap: 2 },
  refLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.semibold },
  refValue: { fontSize: fontSize.sm, color: colors.textPrimary, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  noRefNote: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
});
