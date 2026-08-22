import { useEffect, useRef } from "react";
import { Platform, PermissionsAndroid, AppState } from "react-native";
import * as Device from "expo-device";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  messaging,
  notifee,
  AndroidImportance,
  AndroidStyle,
  EventType,
} from "../utils/safeNotifications";
import type { FirebaseMessagingTypes } from "@react-native-firebase/messaging";
import { WorkerAPI } from "../api/endpoints";
import {
  NotificationData,
  PENDING_NOTIFICATION_ROUTE_KEY,
  resolveNotificationRoute,
} from "../utils/notificationRouting";

async function ensureAndroidChannel() {
  await notifee.createChannel({
    id: "default",
    name: "Default",
    importance: AndroidImportance.HIGH,
    vibration: true,
    lights: true,
    lightColor: "#E8730A",
  });
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  if (Platform.OS === "android" && Platform.Version >= 33) {
    try {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
    } catch {}
  }

  try {
    await notifee.requestPermission();
  } catch {}

  const authStatus = await messaging().requestPermission();
  await ensureAndroidChannel();

  return messaging()
    .getToken()
    .catch(() => null);
}

/** Renders a remote FCM message as a rich Notifee notification (with image). */
async function displayRemoteMessage(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage,
) {
  const data = (remoteMessage.data ?? {}) as Record<string, string>;
  const title =
    remoteMessage.notification?.title ?? data.title ?? "HomeServe Pro";
  const body = remoteMessage.notification?.body ?? data.body ?? "";
  const imageUrl =
    remoteMessage.notification?.android?.imageUrl ?? data.imageUrl;

  await ensureAndroidChannel();

  await notifee.displayNotification({
    title,
    body,
    data,
    android: {
      channelId: "default",
      smallIcon: "ic_launcher",
      pressAction: { id: "default" },
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
  const route = resolveNotificationRoute(data);
  router.push(route as any);
}

export function usePushNotifications(isAuthenticated: boolean) {
  const router = useRouter();
  const unsubscribers = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!isAuthenticated) return;

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
    const unsubscribeTokenRefresh = messaging().onTokenRefresh(
      async (token: string) => {
        try {
          await WorkerAPI.updateFcmToken(token);
        } catch {
          // Non-fatal.
        }
      },
    );

    // Foreground: FCM never auto-displays a notification, so we build
    // the rich (image) notification ourselves via Notifee.
    const unsubscribeOnMessage = messaging().onMessage(
      async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        await displayRemoteMessage(remoteMessage);
      },
    );

    // Worker tapped a Notifee notification (foreground or background tap).
    const unsubscribeNotifeeForeground = notifee.onForegroundEvent(
      ({ type, detail }: { type: number; detail: any }) => {
        if (type === EventType.PRESS) {
          routeFromData(
            router,
            detail.notification?.data as NotificationData | undefined,
          );
        }
      },
    );

    // App was opened from a background (not killed) state via a tap. The
    // actual Notifee background event is registered exactly once, at module
    // scope in index.ts (not here — a hook only exists while its component
    // is mounted, so registering it here would rebind on every mount and
    // was actually a no-op in the true "app backgrounded" case, since that
    // event fires in a headless JS context outside the React tree). That
    // handler can't reach this screen's router, so it stashes the resolved
    // route in AsyncStorage instead; we just need to pick it up here once
    // the app is back in front of the user.
    const consumePendingRoute = async () => {
      try {
        const raw = await AsyncStorage.getItem(PENDING_NOTIFICATION_ROUTE_KEY);
        if (!raw || cancelled) return;
        await AsyncStorage.removeItem(PENDING_NOTIFICATION_ROUTE_KEY);
        router.push(JSON.parse(raw));
      } catch {
        // Non-fatal: worst case the worker just lands on the default tab.
      }
    };
    consumePendingRoute();
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") consumePendingRoute();
    });

    // App was fully killed and opened by tapping a notification.
    notifee.getInitialNotification().then((initial: any) => {
      if (initial && !cancelled) {
        routeFromData(
          router,
          initial.notification?.data as NotificationData | undefined,
        );
      }
    });

    unsubscribers.current = [
      unsubscribeTokenRefresh,
      unsubscribeOnMessage,
      unsubscribeNotifeeForeground,
      () => appStateSub.remove(),
    ];

    return () => {
      cancelled = true;
      unsubscribers.current.forEach((unsub) => unsub());
      unsubscribers.current = [];
    };
  }, [isAuthenticated]);
}
