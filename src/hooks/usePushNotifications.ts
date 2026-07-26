import { useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidStyle,
  EventType,
} from '@notifee/react-native';
import { WorkerAPI } from '../api/endpoints';

// Push notifications (and the native RNFirebase module) aren't available
// in Expo Go — guard every native call the same way index.ts does.
const isExpoGo = Constants.appOwnership === 'expo';

type NotificationData = { bookingId?: string; type?: string; imageUrl?: string };

async function ensureAndroidChannel() {
  await notifee.createChannel({
    id: 'default',
    name: 'Default',
    importance: AndroidImportance.HIGH,
    vibration: true,
    lights: true,
    lightColor: '#E8730A',
  });
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (isExpoGo || !Device.isDevice) {
    // Skip in Expo Go, and push tokens only work on physical devices / real builds anyway.
    return null;
  }

  const authStatus = await messaging().requestPermission();
  const granted =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (!granted) return null;

  await notifee.requestPermission();
  await ensureAndroidChannel();

  return messaging().getToken();
}

/** Renders a remote FCM message as a rich Notifee notification (with image). */
async function displayRemoteMessage(remoteMessage: FirebaseMessagingTypes.RemoteMessage) {
  const data = (remoteMessage.data ?? {}) as Record<string, string>;
  const title = remoteMessage.notification?.title ?? data.title ?? 'HomeServe Pro';
  const body = remoteMessage.notification?.body ?? data.body ?? '';
  const imageUrl = remoteMessage.notification?.android?.imageUrl ?? data.imageUrl;

  await ensureAndroidChannel();

  await notifee.displayNotification({
    title,
    body,
    data,
    android: {
      channelId: 'default',
      smallIcon: 'ic_launcher',
      pressAction: { id: 'default' },
      ...(imageUrl && {
        largeIcon: imageUrl,
        style: { type: AndroidStyle.BIGPICTURE, picture: imageUrl },
      }),
    },
    ios: {
      ...(imageUrl && { attachments: [{ url: imageUrl }] }),
    },
  });
}

function routeFromData(
  router: ReturnType<typeof useRouter>,
  data: NotificationData | undefined,
) {
  if (data?.bookingId) {
    router.push({ pathname: '/job/[id]', params: { id: data.bookingId } });
  } else {
    router.push('/(tabs)/notifications');
  }
}

/**
 * Registers this device for push notifications once the worker is
 * authenticated, syncs the token to the backend, displays rich
 * (image-capable) notifications via Notifee while the app is in the
 * foreground, and routes the worker to the right screen on tap
 * (e.g. straight to the job for a "New Job Available" push).
 *
 * Background/killed-state messages are handled in index.ts
 * (messaging().setBackgroundMessageHandler), which must live outside
 * the React tree.
 *
 * No-op inside Expo Go — push notifications require a development build.
 */
export function usePushNotifications(isAuthenticated: boolean) {
  const router = useRouter();
  const unsubscribers = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!isAuthenticated || isExpoGo) return;

    let cancelled = false;

    (async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token && !cancelled) {
          await WorkerAPI.updateFcmToken(token);
        }
      } catch {
        // Non-fatal: app works fine without push, just no device token synced.
      }
    })();

    // Token can rotate (e.g. after app restore) — keep the backend in sync.
    const unsubscribeTokenRefresh = messaging().onTokenRefresh(async (token) => {
      try {
        await WorkerAPI.updateFcmToken(token);
      } catch {
        // Non-fatal.
      }
    });

    // Foreground: FCM never auto-displays a notification, so we build
    // the rich (image) notification ourselves via Notifee.
    const unsubscribeOnMessage = messaging().onMessage(async (remoteMessage) => {
      await displayRemoteMessage(remoteMessage);
    });

    // Worker tapped a Notifee notification (foreground or background tap).
    const unsubscribeNotifeeForeground = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        routeFromData(router, detail.notification?.data as NotificationData | undefined);
      }
    });

    // App was opened from a background (not killed) state via a tap.
    const unsubscribeNotifeeBackground = notifee.onBackgroundEvent(async ({ type, detail }) => {
      if (type === EventType.PRESS) {
        routeFromData(router, detail.notification?.data as NotificationData | undefined);
      }
    });

    // App was fully killed and opened by tapping a notification.
    notifee.getInitialNotification().then((initial) => {
      if (initial && !cancelled) {
        routeFromData(router, initial.notification?.data as NotificationData | undefined);
      }
    });

    unsubscribers.current = [
      unsubscribeTokenRefresh,
      unsubscribeOnMessage,
      unsubscribeNotifeeForeground,
    ];
    void unsubscribeNotifeeBackground; // registered globally by Notifee, nothing to clean up

    return () => {
      cancelled = true;
      unsubscribers.current.forEach((unsub) => unsub());
      unsubscribers.current = [];
    };
  }, [isAuthenticated]);
}
