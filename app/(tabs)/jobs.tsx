import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Card, StatusPill, statusTone, statusLabel, EmptyState } from '../../src/components/ui';
import Button from '../../src/components/Button';
import JobLocationMap from '../../src/components/JobLocationMap';
import { JobsAPI, Job, JobStatus } from '../../src/api/endpoints';

import messaging from '@react-native-firebase/messaging';

type TabKey = 'requests' | 'upcoming' | 'history';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'requests', label: 'New' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'history', label: 'History' },
];

export default function Jobs() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('requests');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [requestsReason, setRequestsReason] = useState<string | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  // One-off read (not a continuous watch — useLiveTracking already handles
  // that elsewhere) just so the request-card map has a "you are here" pin.
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.getForegroundPermissionsAsync();
        // Previously this only CHECKED for existing permission and gave up
        // if not granted — for a worker who hadn't already granted location
        // somewhere else in the app (e.g. hasn't gone online yet), the map
        // preview showed "unavailable" forever, with no way to fix it from
        // this screen. Now it actually asks.
        if (status !== 'granted') {
          ({ status } = await Location.requestForegroundPermissionsAsync());
        }
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // Best-effort — the map component falls back to a text-only state.
      }
    })();
  }, []);

  const load = useCallback(async (which: TabKey, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      if (which === 'requests') {
        const { data } = await JobsAPI.pendingRequests();
        setJobs(data.data ?? []);
        setRequestsReason(data.meta?.reason ?? null);
      } else if (which === 'upcoming') {
        const { data } = await JobsAPI.upcoming();
        setJobs(data.data ?? []);
      } else {
        const results = await Promise.all(
          (['COMPLETED', 'CANCELLED', 'REJECTED'] as JobStatus[]).map((s) => JobsAPI.myJobs(s)),
        );
        const merged = results.flatMap((r) => r.data.data ?? []);
        merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setJobs(merged);
      }
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [tab, load]),
  );

  // A "New Job Available" push can arrive while the worker is already
  // sitting on this screen (no focus/navigation event fires in that case),
  // which previously left the list stale until the app was reopened.
  // Refetch the "New" tab in place whenever that notification lands.
  useEffect(() => {
    if (!messaging) return;
    // onMessage only fires for foreground pushes, which is exactly the
    // case this in-place refresh is for — background/killed-state pushes
    // already refetch via useFocusEffect when the worker opens the app.
    const unsubscribe = messaging().onMessage((remoteMessage) => {
      const data = remoteMessage.data as { type?: string } | undefined;
      if (data?.type === 'booking.new_request' && tabRef.current === 'requests') {
        load('requests', { silent: true });
      }
    });
    return unsubscribe;
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(tab, { silent: true });
    setRefreshing(false);
  }, [tab, load]);

  const accept = async (id: string) => {
    setActingId(id);
    try {
      await JobsAPI.accept(id);
      await load(tab);
      router.push({ pathname: '/job/[id]', params: { id } });
    } catch (e: any) {
      Alert.alert('Could not accept', e?.response?.data?.message || 'This job may no longer be available.');
      await load(tab);
    } finally {
      setActingId(null);
    }
  };

  const reject = (id: string) => {
    Alert.alert('Decline job?', 'This request will be offered to another worker.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          setActingId(id);
          try {
            await JobsAPI.reject(id);
            await load(tab);
          } catch (e: any) {
            Alert.alert('Could not decline', e?.response?.data?.message || 'Please try again.');
          } finally {
            setActingId(null);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.heading}>Jobs</Text>
      </View>

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="briefcase-outline"
              title={
                tab === 'requests'
                  ? requestsReason === 'NO_SERVICES_SELECTED'
                    ? 'No services selected yet'
                    : 'No new requests nearby'
                  : tab === 'upcoming'
                  ? 'No upcoming jobs'
                  : 'No job history yet'
              }
              subtitle={
                tab === 'requests'
                  ? requestsReason === 'NO_SERVICES_SELECTED'
                    ? 'Go to Profile → Skills & Services and select what you offer to start seeing job requests.'
                    : "Go online from the Home tab, and make sure you're within your service radius of customers."
                  : undefined
              }
            />
          }
          renderItem={({ item }) => (
            <Card
              style={styles.jobCard}
              onPress={tab !== 'requests' ? () => router.push({ pathname: '/job/[id]', params: { id: item.id } }) : undefined}
            >
              <View style={styles.jobTop}>
                <Text style={styles.jobService}>
                  {item.items?.map((i) => i.service?.name).filter(Boolean).join(', ') || 'Service request'}
                </Text>
                <StatusPill label={statusLabel(item.status)} tone={statusTone(item.status)} />
              </View>
              {item.preferredWorkerId ? (
                <View style={styles.directRequestPill}>
                  <Text style={styles.directRequestPillText}>Customer requested you</Text>
                </View>
              ) : null}
              <Text style={styles.jobMeta}>
                {new Date(item.scheduledDate).toLocaleDateString()} · {item.scheduledTime}
              </Text>
              {item.address?.city ? <Text style={styles.jobMeta}>{item.address.city}</Text> : null}
              <Text style={styles.jobAmount}>₹{(item.finalAmount ?? item.total ?? 0).toFixed(0)}</Text>

              {tab !== 'requests' && item.overdueFlaggedAt ? (
                <View style={styles.overdueBanner}>
                  <Text style={styles.overdueBannerText}>
                    ⚠️ Overdue — this job's scheduled time has passed
                  </Text>
                </View>
              ) : null}

              {tab === 'requests' ? (
                <View style={{ marginTop: spacing.sm }}>
                  <JobLocationMap
                    workerLat={myLocation?.lat ?? null}
                    workerLng={myLocation?.lng ?? null}
                    customerLat={item.address?.latitude ?? null}
                    customerLng={item.address?.longitude ?? null}
                    distanceKm={item.distanceKm}
                  />
                </View>
              ) : null}

              {tab === 'requests' ? (
                <View style={styles.actionRow}>
                  <Button
                    title="Decline"
                    variant="outline"
                    size="sm"
                    onPress={() => reject(item.id)}
                    disabled={actingId === item.id}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Accept"
                    size="sm"
                    onPress={() => accept(item.id)}
                    loading={actingId === item.id}
                    style={{ flex: 1 }}
                  />
                </View>
              ) : null}
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xxl, paddingTop: spacing.md },
  heading: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.xxl, marginTop: spacing.lg, gap: spacing.sm },
  tabBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.surfaceMuted },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  list: { padding: spacing.xxl, gap: spacing.md, flexGrow: 1 },
  jobCard: { gap: 4 },
  jobTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  jobService: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  jobMeta: { fontSize: fontSize.xs, color: colors.textMuted },
  jobAmount: { fontSize: fontSize.md, fontWeight: fontWeight.extrabold, color: colors.primary, marginTop: 4 },
  overdueBanner: {
    backgroundColor: colors.dangerLight ?? '#FDECEC',
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  overdueBannerText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.danger ?? '#D92D20',
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  directRequestPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight ?? '#FDECDA',
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
    marginTop: 4,
  },
  directRequestPillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
});