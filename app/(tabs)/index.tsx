import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, radius, spacing } from '../../src/theme';
import { Card, IconBadge, SectionHeader, StatusPill, statusTone, statusLabel, EmptyState, ToggleRow } from '../../src/components/ui';
import { useAuth } from '../../src/store/auth-context';
import { JobsAPI, Job, WalletAPI, WorkerAPI } from '../../src/api/endpoints';
import { useLocation } from '../../src/hooks/useLocation';
import { useLiveTracking } from '../../src/hooks/useLiveTracking';
import { hasRequiredDocuments } from '../../src/lib/worker-verification';

export default function Dashboard() {
  const router = useRouter();
  const { worker, setWorker } = useAuth();
  const { getCurrentPosition } = useLocation();

  const [isOnline, setIsOnline] = useState(!!worker?.isOnline);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [isPaused, setIsPaused] = useState(!!worker?.pausedNewRequests);
  const [togglingPaused, setTogglingPaused] = useState(false);
  const [todayJobs, setTodayJobs] = useState<Job[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [earningsToday, setEarningsToday] = useState(0);
  const [jobsDoneToday, setJobsDoneToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const activeJob = useMemo(
    () => todayJobs.find((j) => j.status === 'IN_PROGRESS') ?? null,
    [todayJobs],
  );

  useLiveTracking(isOnline, activeJob?.id ?? null);

  const load = useCallback(async () => {
    try {
      const [todayRes, pendingRes, earningsRes] = await Promise.all([
        JobsAPI.today(),
        JobsAPI.pendingRequests(),
        WalletAPI.getEarnings('today'),
      ]);
      setTodayJobs(todayRes.data.data ?? []);
      setPendingCount((pendingRes.data.data ?? []).length);
      setEarningsToday(earningsRes.data.data?.netEarnings ?? 0);
      setJobsDoneToday(earningsRes.data.data?.totalJobs ?? 0);
    } catch {
      // Non-fatal — dashboard just shows empty/zero state.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    setIsOnline(!!worker?.isOnline);
  }, [worker?.isOnline]);

  useEffect(() => {
    setIsPaused(!!worker?.pausedNewRequests);
  }, [worker?.pausedNewRequests]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleOnline = async (next: boolean) => {
    setTogglingOnline(true);
    try {
      if (next) {
        const pos = await getCurrentPosition();
        if (!pos) {
          Alert.alert('Location required', 'Turn on location access to go online and receive job requests.');
          setTogglingOnline(false);
          return;
        }
        await WorkerAPI.updateLocation(pos.latitude, pos.longitude);
      }
      await WorkerAPI.setOnlineStatus(next);
      setIsOnline(next);
      if (worker) setWorker({ ...worker, isOnline: next });
    } catch (e: any) {
      Alert.alert('Could not update status', e?.response?.data?.message || 'Please try again.');
    } finally {
      setTogglingOnline(false);
    }
  };

  const togglePaused = async (next: boolean) => {
    setTogglingPaused(true);
    try {
      await WorkerAPI.setPausedStatus(next);
      setIsPaused(next);
      if (worker) setWorker({ ...worker, pausedNewRequests: next });
    } catch (e: any) {
      Alert.alert('Could not update status', e?.response?.data?.message || 'Please try again.');
    } finally {
      setTogglingPaused(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hi, {worker?.name?.split(' ')[0] ?? 'there'} 👋</Text>
            <Text style={styles.greetingSub}>{isOnline ? "You're online and visible" : "You're offline"}</Text>
          </View>
          <View style={[styles.onlineDot, { backgroundColor: isOnline ? colors.success : colors.textMuted }]} />
        </View>

        <Card style={styles.onlineCard}>
          <ToggleRow
            label={isOnline ? 'Online' : 'Offline'}
            subtitle={isOnline ? 'Receiving new job requests' : 'Go online to start receiving jobs'}
            value={isOnline}
            onValueChange={toggleOnline}
          />
          {togglingOnline ? <Text style={styles.updatingText}>Updating…</Text> : null}
        </Card>

        {isOnline ? (
          <Card style={styles.onlineCard}>
            <ToggleRow
              label={isPaused ? 'New requests paused' : 'Accepting new requests'}
              subtitle={
                isPaused
                  ? "You're overloaded — you won't get new job offers, but keep working what's already on your plate."
                  : 'Pause if you have too much on your plate right now'
              }
              value={isPaused}
              onValueChange={togglePaused}
            />
            {togglingPaused ? <Text style={styles.updatingText}>Updating…</Text> : null}
          </Card>
        ) : null}

        {worker && worker.status === 'APPROVED' && !hasRequiredDocuments(worker) ? (
          <Card onPress={() => router.push('/profile/documents')} style={styles.verifyBanner}>
            <View style={styles.activeJobRow}>
              <IconBadge name="shield-checkmark-outline" bg={colors.warningLight} color={colors.warning} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.activeJobTitle}>Finish your verification</Text>
                <Text style={styles.activeJobSub}>Add your ID and selfie to keep your account in good standing.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </View>
          </Card>
        ) : null}

        {activeJob ? (
          <Card onPress={() => router.push({ pathname: '/job/[id]', params: { id: activeJob.id } })} style={styles.activeJobCard}>
            <View style={styles.activeJobRow}>
              <IconBadge name="hammer-outline" bg={colors.primaryLight} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.activeJobTitle}>Job in progress</Text>
                <Text style={styles.activeJobSub}>#{activeJob.bookingNumber} · Tap to view details</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </View>
          </Card>
        ) : null}

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>₹{earningsToday.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Earned today</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{jobsDoneToday}</Text>
            <Text style={styles.statLabel}>Jobs done today</Text>
          </Card>
          <Card onPress={() => router.push('/(tabs)/jobs')} style={styles.statCard}>
            <Text style={styles.statValue}>{pendingCount}</Text>
            <Text style={styles.statLabel}>New requests</Text>
          </Card>
        </View>

        {/* TODAY'S AGENDA / SCHEDULE HEADER */}
        <View style={styles.agendaHeader}>
          <View>
            <View style={styles.agendaTitleRow}>
              <Text style={styles.agendaTitle}>Today's Schedule</Text>
              {todayJobs.length > 0 && (
                <View style={styles.agendaCountBadge}>
                  <Text style={styles.agendaCountText}>{todayJobs.length} {todayJobs.length === 1 ? 'job' : 'jobs'}</Text>
                </View>
              )}
            </View>
            <Text style={styles.agendaSubtitle}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
          </View>

          <Pressable onPress={() => router.push('/(tabs)/jobs')} style={styles.seeAllBtn}>
            <Text style={styles.seeAllBtnText}>See all</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </Pressable>
        </View>

        {/* TODAY'S JOBS LIST */}
        {loading ? null : todayJobs.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No jobs scheduled today"
            subtitle={isOnline ? "You're online — new requests will show up here as soon as customers book." : 'Turn on your online status to start receiving jobs.'}
          />
        ) : (
          <View style={styles.agendaList}>
            {todayJobs.map((job) => {
              const isCurrent = job.status === 'IN_PROGRESS';
              const isDone = job.status === 'COMPLETED';
              
              const serviceName =
                job.items?.map((i) => i.service?.name).filter(Boolean).join(', ') || 'Service request';
              const locationText =
                [job.address?.addressLine1, job.address?.city].filter(Boolean).join(', ') || 'Address in details';
              const customerName =
                job.user?.name || (job as any).customer?.name || 'Customer';

              return (
                <Pressable
                  key={job.id}
                  style={[
                    styles.agendaCard,
                    isCurrent && styles.agendaCardActive,
                    isDone && styles.agendaCardDone,
                  ]}
                  onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
                >
                  {/* Top Bar: Time Badge & Status Pill */}
                  <View style={styles.agendaCardHeader}>
                    <View style={[styles.timeBadge, isCurrent && styles.timeBadgeActive]}>
                      <Ionicons
                        name="time-outline"
                        size={13}
                        color={isCurrent ? colors.white : colors.primaryDark}
                      />
                      <Text style={[styles.timeBadgeText, isCurrent && styles.timeBadgeTextActive]}>
                        {job.scheduledTime || 'Scheduled'}
                      </Text>
                    </View>

                    <StatusPill label={statusLabel(job.status)} tone={statusTone(job.status)} />
                  </View>

                  {/* Main Content */}
                  <View style={styles.agendaCardContent}>
                    <Text style={styles.serviceTitle} numberOfLines={1}>
                      {serviceName}
                    </Text>

                    {/* Customer Name Row */}
                    <View style={styles.metaRow}>
                      <View style={styles.customerAvatarChip}>
                        <Ionicons name="person" size={11} color={colors.primary} />
                      </View>
                      <Text style={styles.customerNameBold} numberOfLines={1}>
                        {customerName}{' '}
                        <Text style={{ color: colors.textMuted, fontWeight: '400' }}>
                          · #{job.bookingNumber ?? job.id.slice(0, 6)}
                        </Text>
                      </Text>
                    </View>

                    {/* Location Row */}
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={13} color={colors.primary} />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {locationText}
                      </Text>
                    </View>
                  </View>

                  {/* Direct Customer Request Banner */}
                  {job.preferredWorkerId ? (
                    <View style={styles.directRequestTag}>
                      <Ionicons name="star" size={12} color={colors.warning} />
                      <Text style={styles.directRequestTagText}>Customer requested you directly</Text>
                    </View>
                  ) : null}

                  {/* Bottom Footer: Payout & Action */}
                  <View style={styles.agendaFooter}>
                    <View style={styles.priceContainer}>
                      <Text style={styles.priceLabel}>Payout</Text>
                      <Text style={styles.priceValue}>₹{(job.finalAmount ?? job.total ?? 0).toFixed(0)}</Text>
                    </View>

                    {/* Bottom Right Details Button */}
                    <View style={styles.actionBtn}>
                      <Text style={styles.actionBtnText}>
                        {isCurrent ? 'Continue' : isDone ? 'Summary' : 'Details'}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={colors.white}
                      />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xxl, paddingBottom: spacing.xxxl * 2, gap: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  greetingSub: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  onlineDot: { width: 12, height: 12, borderRadius: 6 },
  onlineCard: { paddingVertical: spacing.sm },
  updatingText: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: -spacing.sm, marginBottom: spacing.sm },
  activeJobCard: { backgroundColor: colors.primaryLight, borderWidth: 0 },
  verifyBanner: { backgroundColor: colors.warningLight, borderWidth: 0 },
  activeJobRow: { flexDirection: 'row', alignItems: 'center' },
  activeJobTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  activeJobSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  statValue: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4, textAlign: 'center' },

  // Agenda Header
  agendaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  agendaTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  agendaTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  agendaSubtitle: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  agendaCountBadge: { backgroundColor: colors.primaryLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  agendaCountText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.primaryDark },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary },

  // Agenda Cards
  agendaList: { gap: spacing.md },
  agendaCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  agendaCardActive: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: '#FFFDF9',
  },
  agendaCardDone: {
    opacity: 0.85,
  },
  agendaCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  timeBadgeActive: {
    backgroundColor: colors.primary,
  },
  timeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
  },
  timeBadgeTextActive: {
    color: colors.white,
  },
  agendaCardContent: {
    gap: 4,
  },
  serviceTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    flex: 1,
  },
  customerAvatarChip: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerNameBold: {
    fontSize: fontSize.xs + 1,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    flex: 1,
  },
  directRequestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  directRequestTagText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.warning,
  },
  agendaFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs + 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    marginTop: 2,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  priceLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  priceValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  actionBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
});