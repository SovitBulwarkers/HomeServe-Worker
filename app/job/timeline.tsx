import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../../src/theme';
import { JobsAPI, BookingTimeline, TimelineEvent, TimelineEventType } from '../../src/api/endpoints';

const EVENT_META: Record<
  TimelineEventType,
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  CREATED: { icon: 'add-circle', color: colors.info, bg: colors.infoLight },
  WORKER_DECLINED: { icon: 'close-circle', color: colors.textMuted, bg: colors.surfaceMuted },
  ACCEPTED: { icon: 'checkmark-circle', color: colors.primary, bg: colors.primaryLight },
  RESCHEDULED: { icon: 'calendar', color: colors.warning, bg: colors.warningLight },
  RUNNING_LATE: { icon: 'time', color: colors.warning, bg: colors.warningLight },
  REASSIGNED_NO_SHOW: { icon: 'swap-horizontal', color: colors.danger, bg: colors.dangerLight },
  STARTED: { icon: 'play-circle', color: colors.info, bg: colors.infoLight },
  COMPLETED: { icon: 'checkmark-done-circle', color: colors.success, bg: colors.successLight },
  CANCELLED: { icon: 'close-circle', color: colors.danger, bg: colors.dangerLight },
  REJECTED: { icon: 'close-circle', color: colors.danger, bg: colors.dangerLight },
};

function formatDateHeading(date: Date): string {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function BookingTimelineScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [timeline, setTimeline] = useState<BookingTimeline | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await JobsAPI.getTimeline(id);
      setTimeline(data.data ?? null);
    } catch {
      setTimeline(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Group events by calendar day so a multi-day job (rescheduled, ran late
  // across visits, etc.) reads as a clear day-by-day story rather than one
  // long undifferentiated list.
  const groups: { heading: string; events: TimelineEvent[] }[] = [];
  if (timeline) {
    for (const event of timeline.events) {
      const d = new Date(event.at);
      const heading = formatDateHeading(d);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.heading === heading) {
        lastGroup.events.push(event);
      } else {
        groups.push({ heading, events: [event] });
      }
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
          <Text style={styles.headerTitle}>Booking Timeline</Text>
          {timeline ? <Text style={styles.headerSub}>#{timeline.bookingNumber}</Text> : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : !timeline || timeline.events.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="git-commit-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyText}>No timeline events yet</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {groups.map((group, gi) => (
            <View key={group.heading + gi}>
              <View style={styles.dateHeadingRow}>
                <Text style={styles.dateHeading}>{group.heading}</Text>
                <View style={styles.dateHeadingLine} />
              </View>

              {group.events.map((event, ei) => {
                const meta = EVENT_META[event.type] ?? EVENT_META.CREATED;
                const isLastOverall = gi === groups.length - 1 && ei === group.events.length - 1;
                const time = new Date(event.at).toLocaleTimeString('en-IN', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                });
                return (
                  <View key={event.type + event.at} style={styles.eventRow}>
                    <View style={styles.eventDotCol}>
                      <View style={[styles.eventDot, { backgroundColor: meta.bg, borderColor: meta.color }]}>
                        <Ionicons name={meta.icon} size={15} color={meta.color} />
                      </View>
                      {!isLastOverall ? <View style={styles.eventLine} /> : null}
                    </View>
                    <View style={styles.eventContent}>
                      <Text style={styles.eventLabel}>{event.label}</Text>
                      <Text style={styles.eventTime}>{time}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.subtle },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  headerSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted },
  content: { padding: spacing.xxl, paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  dateHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },
  dateHeading: { fontSize: fontSize.xs, fontWeight: fontWeight.extrabold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateHeadingLine: { flex: 1, height: 1, backgroundColor: colors.border },
  eventRow: { flexDirection: 'row' },
  eventDotCol: { alignItems: 'center', width: 36 },
  eventDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  eventLine: { width: 2, flex: 1, minHeight: spacing.xl, backgroundColor: colors.border, marginTop: 2 },
  eventContent: { flex: 1, marginLeft: spacing.md, paddingBottom: spacing.xl },
  eventLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, lineHeight: 19 },
  eventTime: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 3 },
});
