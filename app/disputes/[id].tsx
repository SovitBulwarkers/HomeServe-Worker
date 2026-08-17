import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../../src/theme';
import { Card, StatusPill } from '../../src/components/ui';
import Button from '../../src/components/Button';
import { DisputesAPI, Dispute } from '../../src/api/endpoints';
import { disputeReasonLabel, disputeStatusLabel, disputeStatusTone, OPEN_DISPUTE_STATUSES } from '../../src/constants/disputes';

const OUTCOME_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  RESOLVED_REFUNDED: { icon: 'checkmark-circle', color: colors.success, label: 'Refund issued' },
  RESOLVED_PARTIAL_REFUND: { icon: 'checkmark-circle', color: colors.success, label: 'Partial refund issued' },
  RESOLVED_UPHELD: { icon: 'shield-checkmark', color: colors.info, label: 'Original charge upheld' },
  RESOLVED_NO_ACTION: { icon: 'information-circle', color: colors.info, label: 'No action taken' },
  WITHDRAWN: { icon: 'close-circle', color: colors.danger, label: 'Withdrawn' },
};

export default function DisputeDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await DisputesAPI.getById(id);
      setDispute(data.data ?? null);
    } catch {
      setDispute(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const isOpen = dispute ? OPEN_DISPUTE_STATUSES.includes(dispute.status) : false;

  const withdraw = () => {
    if (!dispute) return;
    Alert.alert(
      'Withdraw dispute',
      'Are you sure you want to withdraw this dispute? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setWithdrawing(true);
            try {
              await DisputesAPI.withdraw(dispute.id);
              await load();
            } catch (e: any) {
              Alert.alert('Could not withdraw', e?.response?.data?.message || 'Please try again.');
            } finally {
              setWithdrawing(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Dispute Details</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : !dispute ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Couldn't load this dispute.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.statusRow}>
            <StatusPill label={disputeStatusLabel(dispute.status)} tone={disputeStatusTone(dispute.status)} />
            <Text style={styles.bookingRef}>#{dispute.booking?.bookingNumber ?? dispute.bookingId.slice(0, 8)}</Text>
          </View>

          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.rowIconLabel}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.reasonTitle}>{disputeReasonLabel(dispute.reason)}</Text>
            </View>
            <Text style={styles.description}>{dispute.description}</Text>
            {dispute.amountClaimed ? (
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Amount in question</Text>
                <Text style={styles.amountValue}>₹{Number(dispute.amountClaimed).toFixed(0)}</Text>
              </View>
            ) : null}
            <Text style={styles.raisedDate}>Raised {new Date(dispute.createdAt).toLocaleString()}</Text>
          </Card>

          {/* Progress timeline */}
          <Card style={{ marginBottom: spacing.md }}>
            <Text style={styles.timelineTitle}>Progress</Text>
            <TimelineStep
              label="Dispute submitted"
              done
              timestamp={dispute.createdAt}
            />
            <TimelineStep
              label="Under review"
              done={dispute.status !== 'OPEN'}
              active={dispute.status === 'UNDER_REVIEW'}
            />
            <TimelineStep
              label={dispute.status === 'WITHDRAWN' ? 'Withdrawn' : 'Resolved'}
              done={!!dispute.resolvedAt}
              timestamp={dispute.resolvedAt ?? undefined}
              isLast
            />
          </Card>

          {dispute.resolvedAt ? (
            <Card style={{ marginBottom: spacing.md, backgroundColor: colors.surfaceMuted }}>
              <View style={styles.rowIconLabel}>
                <Ionicons
                  name={OUTCOME_META[dispute.status]?.icon ?? 'information-circle'}
                  size={18}
                  color={OUTCOME_META[dispute.status]?.color ?? colors.info}
                />
                <Text style={styles.reasonTitle}>{OUTCOME_META[dispute.status]?.label ?? 'Resolved'}</Text>
              </View>
              {dispute.resolutionNote ? <Text style={styles.description}>{dispute.resolutionNote}</Text> : null}
              <Text style={styles.raisedDate}>{new Date(dispute.resolvedAt).toLocaleString()}</Text>
            </Card>
          ) : (
            <View style={styles.pendingNote}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={styles.pendingNoteText}>
                Our team is reviewing this dispute. You'll be notified as soon as there's an update.
              </Text>
            </View>
          )}

          {isOpen ? (
            <Button
              title="Withdraw Dispute"
              variant="outline"
              onPress={withdraw}
              loading={withdrawing}
              style={{ marginTop: spacing.md, borderColor: colors.danger }}
              icon={<Ionicons name="close-circle-outline" size={18} color={colors.danger} />}
            />
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TimelineStep({
  label,
  done,
  active,
  timestamp,
  isLast,
}: {
  label: string;
  done?: boolean;
  active?: boolean;
  timestamp?: string;
  isLast?: boolean;
}) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineDotCol}>
        <View
          style={[
            styles.timelineDot,
            done && styles.timelineDotDone,
            active && styles.timelineDotActive,
          ]}
        >
          {done ? <Ionicons name="checkmark" size={11} color={colors.white} /> : null}
        </View>
        {!isLast ? <View style={[styles.timelineLine, done && styles.timelineLineDone]} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: isLast ? 0 : spacing.lg }}>
        <Text style={[styles.timelineLabel, (done || active) && styles.timelineLabelActive]}>{label}</Text>
        {timestamp ? <Text style={styles.timelineTime}>{new Date(timestamp).toLocaleString()}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.subtle },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md },
  content: { padding: spacing.xxl, paddingTop: 0 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  bookingRef: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: fontWeight.semibold },
  rowIconLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  reasonTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary, flex: 1 },
  description: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, marginBottom: spacing.sm },
  amountLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  amountValue: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary },
  raisedDate: { fontSize: fontSize.xs, color: colors.textMuted },
  timelineTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.md },
  timelineRow: { flexDirection: 'row' },
  timelineDotCol: { alignItems: 'center', width: 24 },
  timelineDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surfaceMuted, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  timelineDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  timelineDotActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.border, marginTop: 2 },
  timelineLineDone: { backgroundColor: colors.success },
  timelineLabel: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: fontWeight.medium, marginLeft: spacing.sm },
  timelineLabelActive: { color: colors.textPrimary, fontWeight: fontWeight.semibold },
  timelineTime: { fontSize: fontSize.xs, color: colors.textMuted, marginLeft: spacing.sm, marginTop: 2 },
  pendingNote: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingHorizontal: spacing.sm },
  pendingNoteText: { flex: 1, fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 16 },
});
