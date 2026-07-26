import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Card } from '../../src/components/ui';
import Button from '../../src/components/Button';
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

export default function TrackJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    JobsAPI.getById(id)
      .then(({ data }) => setJob(data.data))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!job?.address?.latitude || !job?.address?.longitude) return;
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 20 }, (pos) => {
        setDistance(
          distanceKm(pos.coords.latitude, pos.coords.longitude, job.address!.latitude!, job.address!.longitude!),
        );
      });
    })();

    return () => sub?.remove();
  }, [job?.address?.latitude, job?.address?.longitude]);

  const openMaps = async () => {
    if (!job?.address?.latitude || !job?.address?.longitude) {
      Alert.alert('No location', "This booking doesn't have a saved location to navigate to.");
      return;
    }
    const { latitude, longitude } = job.address;

    // Previously this called Linking.openURL directly with no error
    // handling — if it failed (no default browser/maps handler resolved
    // on the device, or a transient issue) the button just did nothing
    // with zero feedback. Now: try the Google Maps deep link first, fall
    // back to a plain https Maps URL, and only then tell the user it
    // failed instead of leaving them tapping a dead button.
    const candidates = [
      Platform.OS === 'android'
        ? `geo:${latitude},${longitude}?q=${latitude},${longitude}(Customer)`
        : `maps://?daddr=${latitude},${longitude}`,
      `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
      `https://maps.google.com/?q=${latitude},${longitude}`,
    ];

    for (const url of candidates) {
      try {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
          return;
        }
      } catch {
        // try the next candidate
      }
    }

    Alert.alert(
      'Could not open Maps',
      'No maps app was found on this device. Please install Google Maps to navigate to this job.',
    );
  };

  if (loading || !job) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Navigate to job</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Card style={styles.card}>
          <Ionicons name="location" size={32} color={colors.primary} />
          <Text style={styles.address}>{job.address?.fullAddress}</Text>
          {job.address?.landmark ? <Text style={styles.landmark}>Near {job.address.landmark}</Text> : null}
          {distance !== null ? <Text style={styles.distance}>{distance.toFixed(1)} km away</Text> : null}
        </Card>

        <Button
          title="Open in Google Maps"
          icon={<Ionicons name="navigate" size={18} color={colors.white} />}
          onPress={openMaps}
          style={{ marginTop: spacing.xl }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  content: { padding: spacing.xxl },
  card: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  address: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary, textAlign: 'center' },
  landmark: { fontSize: fontSize.sm, color: colors.textSecondary },
  distance: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.primary, marginTop: spacing.sm },
});
