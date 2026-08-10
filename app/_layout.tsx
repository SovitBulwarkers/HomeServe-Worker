import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator, Platform, PermissionsAndroid } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import notifee from '@notifee/react-native';
import { AuthProvider, useAuth } from '../src/store/auth-context';
import { colors } from '../src/theme';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { hasRequiredDocuments } from '../src/lib/worker-verification';
import PermissionsModal from '../src/components/PermissionsModal';
import { ONBOARDING_KEY, PERMISSIONS_PROMPTED_KEY } from '../src/constants/storage';
export { ONBOARDING_KEY, PERMISSIONS_PROMPTED_KEY };

function RootNavigation() {
  const { isAuthenticated, isLoading, worker } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  usePushNotifications(isAuthenticated);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => setHasOnboarded(v === 'true'));
  }, [segments]);

  // Trigger native system OS permissions (Notifications, Location, Camera) directly from app launch
  useEffect(() => {
    (async () => {
      try {
        // 1. Push Notifications Permission
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }
        if (notifee) {
          await notifee.requestPermission();
        }

        // 2. Location Permission
        if (Platform.OS === 'android') {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        }
        await Location.requestForegroundPermissionsAsync();

        // 3. Camera Permission
        if (Platform.OS === 'android') {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        }
        await ImagePicker.requestCameraPermissionsAsync();
      } catch (e) {
        console.log('Native permission request on app start error:', e);
      }
    })();
  }, []);

  useEffect(() => {
    if (isLoading || hasOnboarded === null) return;

    const segs = segments as unknown as string[];
    const inAuthGroup = segs[0] === '(auth)';
    const onIntroSlides = segs[0] === '(auth)' && segs[1] === 'onboarding';
    const onCreateProfile = segs[0] === '(auth)' && segs[1] === 'create-profile';
    const onDocuments = segs[0] === '(auth)' && segs[1] === 'documents';
    const onPendingApproval = segs[0] === 'pending-approval';
    const onAllowedWhileUnapproved = segs[0] === 'profile' || segs[0] === 'support';

    if (!hasOnboarded) {
      if (!onIntroSlides) router.replace('/(auth)/onboarding');
      return;
    }

    if (!isAuthenticated) {
      if (!inAuthGroup || onIntroSlides) router.replace('/(auth)/login');
      return;
    }

    if (worker && !worker.name) {
      if (!onCreateProfile) router.replace('/(auth)/create-profile');
      return;
    }

    if (worker && worker.status === 'PENDING' && !hasRequiredDocuments(worker) && !onAllowedWhileUnapproved) {
      if (!onDocuments) router.replace('/(auth)/documents');
      return;
    }

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