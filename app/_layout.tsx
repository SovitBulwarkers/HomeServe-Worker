import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from '../src/store/auth-context';
import { colors } from '../src/theme';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { hasRequiredDocuments } from '../src/lib/worker-verification';

export const ONBOARDING_KEY = 'homeserve_worker_has_onboarded';

function RootNavigation() {
  const { isAuthenticated, isLoading, worker } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  usePushNotifications(isAuthenticated);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => setHasOnboarded(v === 'true'));
  }, []);

  useEffect(() => {
    if (isLoading || hasOnboarded === null) return;

    const segs = segments as unknown as string[];
    const inAuthGroup = segs[0] === '(auth)';
    const onIntroSlides = segs[0] === '(auth)' && segs[1] === 'onboarding';
    const onCreateProfile = segs[0] === '(auth)' && segs[1] === 'create-profile';
    const onDocuments = segs[0] === '(auth)' && segs[1] === 'documents';
    const onPendingApproval = segs[0] === 'pending-approval';
    // A worker who isn't approved yet can still reach these — re-uploading
    // documents after a rejection, or reaching out to support — without
    // being bounced straight back to the pending-approval screen.
    const onAllowedWhileUnapproved = segs[0] === 'profile' || segs[0] === 'support';

    if (!hasOnboarded) {
      if (!onIntroSlides) router.replace('/(auth)/onboarding');
      return;
    }

    if (!isAuthenticated) {
      if (!inAuthGroup || onIntroSlides) router.replace('/(auth)/login');
      return;
    }

    // Step 1 of registration: name / bio / services haven't been set yet.
    if (worker && !worker.name) {
      if (!onCreateProfile) router.replace('/(auth)/create-profile');
      return;
    }

    // Step 2: profile is filled in but this application was never submitted
    // with the required verification documents — either a brand-new
    // worker who hasn't finished onboarding yet, or an older account that
    // registered before document upload existed. Either way, an admin
    // can't review an application with nothing to look at, so route them
    // here before they're allowed to just sit on the "under review" screen.
    // (Workers who are already APPROVED are left alone — see note below.)
    if (worker && worker.status === 'PENDING' && !hasRequiredDocuments(worker) && !onAllowedWhileUnapproved) {
      if (!onDocuments) router.replace('/(auth)/documents');
      return;
    }

    // Authenticated, profile + documents submitted, but the admin hasn't
    // approved this worker yet — keep them out of the job-accepting flow
    // until they're cleared.
    if (worker && worker.status !== 'APPROVED' && !onAllowedWhileUnapproved) {
      if (!onPendingApproval) router.replace('/pending-approval');
      return;
    }

    if (inAuthGroup || onPendingApproval) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, hasOnboarded, segments, worker?.status, worker?.name, worker?.documents]);

  if (isLoading || hasOnboarded === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="pending-approval" />
      <Stack.Screen name="job/[id]" />
      <Stack.Screen name="job/chat" />
      <Stack.Screen name="job/track" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigation />
      </AuthProvider>
    </SafeAreaProvider>
  );
}