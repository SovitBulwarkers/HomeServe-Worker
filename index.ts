import {
  messaging,
  notifee,
  AndroidImportance,
  AndroidStyle,
  isNativeNotificationSupported,
} from "./src/utils/safeNotifications";

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

  try {
    notifee.onBackgroundEvent(async () => {
      // Background event handler registered at app entry point for Notifee
    });
  } catch (e) {
    console.warn("Failed to register Notifee background event handler:", e);
  }
}

require("expo-router/entry");
