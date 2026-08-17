import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Card, StatusPill, statusTone, statusLabel, EmptyState } from '../../src/components/ui';
import Button from '../../src/components/Button';
import JobLocationMap from '../../src/components/JobLocationMap';
import { JobsAPI, Job, JobStatus, PreBookingChatAPI, checkIsCodPayment } from '../../src/api/endpoints';

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
  const [inquiryUnread, setInquiryUnread] = useState(0);
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
      PreBookingChatAPI.getThreads()
        .then(({ data }) => {
          const total = (data.data ?? []).reduce((sum, t) => sum + t.unreadCount, 0);
          setInquiryUnread(total);
        })
        .catch(() => undefined);
    }, [tab, load]),
  );

  // A "New Job Available" push can arrive while the worker is already
  // sitting on this screen (no focus/navigation event fires in that case),
  // which previously left the list stale until the app was reopened.
  // Refetch the "New" tab in place whenever that notification lands.
  useEffect(() => {
    if (typeof messaging !== 'undefined' && messaging) {
      const unsubscribe = (messaging as any)().onMessage((remoteMessage: any) => {
        const data = remoteMessage.data as { type?: string } | undefined;
        if (data?.type === 'booking.new_request' && tabRef.current === 'requests') {
          load('requests', { silent: true });
        }
      });
      return unsubscribe;
    }
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
        <Pressable onPress={() => router.push('/prebooking')} style={styles.inquiryBtn}>
          <Ionicons name="chatbubbles-outline" size={22} color={colors.textPrimary} />
          {inquiryUnread > 0 && (
            <View style={styles.inquiryBadge}>
              <Text style={styles.inquiryBadgeText}>{inquiryUnread > 9 ? '9+' : inquiryUnread}</Text>
            </View>
          )}
        </Pressable>
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
          renderItem={({ item }) => {
            const total = item.finalAmount ?? item.total ?? 0;

            return (
              <Card
                style={styles.richJobCard}
                onPress={() => router.push({ pathname: '/job/[id]', params: { id: item.id } })}
              >
                {/* Header Row: Service Name & Status */}
                <View style={styles.jobCardHeader}>
                  <View style={{ flex: 1, paddingRight: spacing.sm }}>
                    <Text style={styles.richJobTitle} numberOfLines={1}>
                      {item.items?.map((i) => i.service?.name).filter(Boolean).join(', ') || 'Service request'}
                    </Text>
                    {item.user?.name ? (
                      <View style={styles.customerNameBadge}>
                        <Ionicons name="person-circle-outline" size={14} color={colors.textSecondary} />
                        <Text style={styles.customerNameText}>{item.user.name}</Text>
                      </View>
                    ) : null}
                  </View>
                  <StatusPill label={statusLabel(item.status)} tone={statusTone(item.status)} />
                </View>

                {item.preferredWorkerId ? (
                  <View style={styles.directRequestPill}>
                    <Ionicons name="star" size={12} color={colors.primary} />
                    <Text style={styles.directRequestPillText}>Requested you directly</Text>
                  </View>
                ) : null}

                {/* Date & Time Row */}
                <View style={styles.richMetaRow}>
                  <View style={styles.timePill}>
                    <Ionicons name="time-outline" size={13} color={colors.primary} />
                    <Text style={styles.timePillText}>
                      {new Date(item.scheduledDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {item.scheduledTime}
                    </Text>
                  </View>
                </View>

                {/* Location */}
                {item.address?.fullAddress || item.address?.city ? (
                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {item.address.fullAddress || item.address.city}
                    </Text>
                  </View>
                ) : null}

                {tab !== 'requests' && item.overdueFlaggedAt ? (
                  <View style={styles.overdueBanner}>
                    <Ionicons name="alert-circle" size={14} color={colors.danger} />
                    <Text style={styles.overdueBannerText}>Overdue job</Text>
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

                {/* Footer Payout & Action */}
                <View style={styles.cardFooterRow}>
                  <View>
                    <Text style={styles.payoutLabel}>Total Payout</Text>
                    <Text style={styles.payoutValue}>₹{total.toFixed(0)}</Text>
                  </View>

                  {tab === 'requests' ? (
                    <View style={styles.requestActionBtns}>
                      <Button
                        title="Decline"
                        variant="outline"
                        size="sm"
                        onPress={() => reject(item.id)}
                        disabled={actingId === item.id}
                      />
                      <Button
                        title="Accept"
                        size="sm"
                        onPress={() => accept(item.id)}
                        loading={actingId === item.id}
                      />
                    </View>
                  ) : (
                    <View style={styles.detailsBtnLink}>
                      <Text style={styles.detailsBtnText}>Details</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                    </View>
                  )}
                </View>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xxl, paddingTop: spacing.md },
  heading: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  inquiryBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  inquiryBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  inquiryBadgeText: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.white },
  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.xxl, marginTop: spacing.lg, gap: spacing.sm },
  tabBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.surfaceMuted },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  richJobCard: {
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    gap: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  jobCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  richJobTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  customerNameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  customerNameText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  richMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  timePillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
  },
  codPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  codPillText: {
    fontSize: 11,
    fontWeight: fontWeight.extrabold,
    color: '#B45309',
  },
  paidPill: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  paidPillText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: '#065F46',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  locationText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    flex: 1,
  },
  richAddressCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  richAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  richAddressText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 18,
  },
  richLandmarkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  richLandmarkText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: '#92400E',
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  payoutLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  payoutValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  requestActionBtns: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  detailsBtnLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  detailsBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  directRequestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  directRequestPillText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
  },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  overdueBannerText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.danger,
  },
});