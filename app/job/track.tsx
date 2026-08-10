import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../../src/theme';
import { Card, IconBadge } from '../../src/components/ui';
import Button from '../../src/components/Button';
import JobLocationMap from '../../src/components/JobLocationMap';
import { JobsAPI, Job } from '../../src/api/endpoints';

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDriveTime(distKm: number): string {
  if (distKm <= 0.5) return '1-2 mins';
  const mins = Math.round((distKm / 25) * 60);
  return `${mins} mins`;
}

export default function TrackJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [workerLocation, setWorkerLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    JobsAPI.getById(id)
      .then(({ data }) => setJob(data.data))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 6000, distanceInterval: 15 },
        (pos) => {
          setWorkerLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          if (job?.address?.latitude && job?.address?.longitude) {
            setDistance(
              distanceKm(pos.coords.latitude, pos.coords.longitude, job.address.latitude, job.address.longitude),
            );
          }
        },
      );
    })();

    return () => sub?.remove();
  }, [job?.address?.latitude, job?.address?.longitude]);

  const openNavigationApp = async (type: 'google' | 'apple' | 'geo') => {
    const latitude = job?.address?.latitude || 28.6139;
    const longitude = job?.address?.longitude || 77.2090;
    let url = '';

    if (type === 'google') {
      url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    } else if (type === 'apple') {
      url = `maps://?daddr=${latitude},${longitude}`;
    } else {
      url = Platform.OS === 'android'
        ? `geo:${latitude},${longitude}?q=${latitude},${longitude}(Customer)`
        : `maps://?daddr=${latitude},${longitude}`;
    }

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open map app', 'Please ensure Google Maps or Apple Maps is installed on your device.');
    }
  };

  const callCustomer = () => {
    if (job?.user?.phone) Linking.openURL(`tel:${job.user.phone}`);
  };

  if (loading || !job) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxxl }} />
      </SafeAreaView>
    );
  }

  const driveTime = distance !== null ? estimateDriveTime(distance) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Navigate to Job Site</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Map Card */}
        <View style={styles.mapCard}>
          <JobLocationMap
            workerLat={workerLocation?.latitude ?? null}
            workerLng={workerLocation?.longitude ?? null}
            customerLat={job.address?.latitude ?? null}
            customerLng={job.address?.longitude ?? null}
            distanceKm={distance}
            height={200}
          />
        </View>

        {/* Live Metrics Cards */}
        <View style={styles.metricsRow}>
          <Card style={styles.metricCard}>
            <Ionicons name="navigate-circle" size={24} color={colors.primary} />
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>
              {distance !== null ? `${distance.toFixed(1)} km` : '0.0 km'}
            </Text>
          </Card>

          <Card style={styles.metricCard}>
            <Ionicons name="time" size={24} color={colors.info} />
            <Text style={styles.metricLabel}>Est. Travel Time</Text>
            <Text style={styles.metricValue}>{driveTime ?? '1-2 mins'}</Text>
          </Card>
        </View>

        {/* Customer & Address Details Card */}
        <Card style={styles.detailsCard}>
          <View style={styles.customerRow}>
            {job.user?.avatar ? (
              <Image source={{ uri: job.user.avatar }} style={styles.avatar} />
            ) : (
              <IconBadge name="person" size={20} badgeSize={46} />
            )}
            <View style={styles.customerTextWrap}>
              <Text style={styles.customerName}>{job.user?.name ?? 'Customer'}</Text>
              <Text style={styles.customerPhone}>{job.user?.phone ?? 'No phone number'}</Text>
            </View>
            {job.user?.phone ? (
              <Pressable onPress={callCustomer} style={[styles.circleBtn, { backgroundColor: colors.success }]}>
                <Ionicons name="call" size={18} color={colors.white} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.addressSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="location" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>JOB LOCATION</Text>
            </View>
            <Text style={styles.addressText}>{job.address?.fullAddress}</Text>

            {job.address?.landmark ? (
              <View style={styles.landmarkChip}>
                <Ionicons name="flag" size={14} color={colors.primary} />
                <Text style={styles.landmarkText}>Landmark: {job.address.landmark}</Text>
              </View>
            ) : null}
          </View>
        </Card>

        {/* Start Navigation CTA */}
        <View style={styles.buttonGroup}>
          <Button
            title="Start Navigation (Google Maps)"
            icon={<Ionicons name="navigate" size={20} color={colors.white} />}
            onPress={() => openNavigationApp('google')}
            style={styles.mainNavBtn}
          />

          {Platform.OS === 'ios' ? (
            <Button
              title="Open in Apple Maps"
              variant="outline"
              icon={<Ionicons name="logo-apple" size={18} color={colors.textPrimary} />}
              onPress={() => openNavigationApp('apple')}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.subtle,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.xs,
  },
  mapCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  metricCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  metricLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontWeight: fontWeight.medium,
  },
  metricValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  detailsCard: {
    marginTop: spacing.md,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  customerTextWrap: {
    flex: 1,
    marginLeft: spacing.md,
  },
  customerName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  customerPhone: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.subtle,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  addressSection: {},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
  },
  addressText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  landmarkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  landmarkText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primaryDark,
  },
  buttonGroup: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  mainNavBtn: {
    height: 52,
    borderRadius: radius.xl,
  },
});
