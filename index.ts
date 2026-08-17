import messaging, {
  FirebaseMessagingTypes,
} from "@react-native-firebase/messaging";
import notifee, {
  AndroidImportance,
  AndroidStyle,
} from "@notifee/react-native";

messaging().setBackgroundMessageHandler(
  async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
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

require("expo-router/entry");
