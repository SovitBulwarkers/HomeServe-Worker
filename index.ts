import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  messaging,
  notifee,
  AndroidImportance,
  AndroidStyle,
  EventType,
  isNativeNotificationSupported,
} from "./src/utils/safeNotifications";
import {
  PENDING_NOTIFICATION_ROUTE_KEY,
  resolveNotificationRoute,
} from "./src/utils/notificationRouting";
// Registering the background task here also defines it — background
// location updates must be defined once at module scope (same constraint
// as the Notifee background handler below), not inside a component/hook.
import "./src/tasks/locationTrackingTask";

if (isNativeNotificationSupported) {
  try {
    messaging().setBackgroundMessageHandler(
      async (remoteMessage: any) => {
        const data = (remoteMessage.data ?? {}) as Record<string, string>;
        const title =
          remoteMessage.notification?.title ?? data.title ?? "HomeServe Pro";
        const body = remoteMessage.notification?.body ?? data.body ?? "";
        const imageUrl =
          remoteMessage.notification?.android?.imageUrl ?? data.imageUrl;

        await notifee.createChannel({
          id: "default",
          name: "Default",
          importance: AndroidImportance.HIGH,
        });

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
        });
      },
    );
  } catch (e) {
    console.warn("Failed to register background message handler:", e);
  }

  // This is the ONLY place notifee.onBackgroundEvent should be registered.
  // It used to also be (re-)registered inside usePushNotifications' effect,
  // which was both redundant and ineffective there — background events run
  // in a headless JS context outside the React tree, so a handler bound
  // inside a component only ever fires while that component happens to be
  // mounted, and calling registration twice risks duplicate/uncertain
  // delivery. There's no navigator available at this entry point (the app
  // may not even be fully launched yet), so instead of routing directly we
  // persist the resolved destination and let the app pick it up once it's
  // actually in front of the user (see usePushNotifications.ts).
  try {
    notifee.onBackgroundEvent(async ({ type, detail }: any) => {
      if (type !== EventType.PRESS) return;
      try {
        const route = resolveNotificationRoute(detail?.notification?.data);
        await AsyncStorage.setItem(
          PENDING_NOTIFICATION_ROUTE_KEY,
          JSON.stringify(route),
        );
      } catch (e) {
        console.warn("Failed to persist pending notification route:", e);
      }
    });
  } catch (e) {
    console.warn("Failed to register Notifee background event handler:", e);
  }
}

require("expo-router/entry");
