import { useEffect, useRef } from "react";
import { Platform, PermissionsAndroid } from "react-native";
import * as Device from "expo-device";
import { useRouter } from "expo-router";
import {
  messaging,
  notifee,
  AndroidImportance,
  AndroidStyle,
  EventType,
} from "../utils/safeNotifications";
import type { FirebaseMessagingTypes } from "@react-native-firebase/messaging";
import { WorkerAPI } from "../api/endpoints";

type NotificationData = {
  bookingId?: string;
  type?: string;
  imageUrl?: string;
  counterpartId?: string;
  senderName?: string;
};

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
  if (data?.bookingId) {
    router.push({ pathname: "/job/[id]", params: { id: data.bookingId } });
  } else if (data?.type === "PREBOOKING_MESSAGE" && data?.counterpartId) {
    router.push({
      pathname: "/prebooking/[userId]",
      params: { userId: data.counterpartId, userName: data.senderName },
    });
  } else {
    router.push("/(tabs)/notifications");
  }
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
      ({ type, detail }) => {
        if (type === EventType.PRESS) {
          routeFromData(
            router,
            detail.notification?.data as NotificationData | undefined,
          );
        }
      },
    );

    // App was opened from a background (not killed) state via a tap.
    const unsubscribeNotifeeBackground = notifee.onBackgroundEvent(
      async ({ type, detail }) => {
        if (type === EventType.PRESS) {
          routeFromData(
            router,
            detail.notification?.data as NotificationData | undefined,
          );
        }
      },
    );

    // App was fully killed and opened by tapping a notification.
    notifee.getInitialNotification().then((initial) => {
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
    ];
    void unsubscribeNotifeeBackground;

    return () => {
      cancelled = true;
      unsubscribers.current.forEach((unsub) => unsub());
      unsubscribers.current = [];
    };
  }, [isAuthenticated]);
}
