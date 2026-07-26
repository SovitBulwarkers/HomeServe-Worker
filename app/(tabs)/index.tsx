import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing } from '../../src/theme';
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

        <SectionHeader title="Today's schedule" actionLabel="See all" onAction={() => router.push('/(tabs)/jobs')} />

        {loading ? null : todayJobs.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No jobs scheduled today"
            subtitle={isOnline ? "You're online — new requests will show up here." : 'Go online to start receiving job requests.'}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {todayJobs.map((job) => (
              <Card key={job.id} onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}>
                <View style={styles.jobRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobService}>
                      {job.items?.map((i) => i.service?.name).filter(Boolean).join(', ') || 'Service'}
                    </Text>
                    <Text style={styles.jobMeta}>
                      {job.scheduledTime} · {job.address?.city ?? ''}
                    </Text>
                  </View>
                  <StatusPill label={statusLabel(job.status)} tone={statusTone(job.status)} />
                </View>
              </Card>
            ))}
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
  jobRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  jobService: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  jobMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});