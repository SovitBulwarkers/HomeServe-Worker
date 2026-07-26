import Constants from 'expo-constants';

// Push notifications (and the native RNFirebase module) aren't available
// in Expo Go — skip registering the background handler there so the app
// doesn't crash with "Native module RNFBAppModule not found".
const isExpoGo = Constants.appOwnership === 'expo';

if (!isExpoGo) {
  const messaging = require('@react-native-firebase/messaging').default;
  const notifee = require('@notifee/react-native').default;
  const { AndroidImportance, AndroidStyle } = require('@notifee/react-native');

  messaging().setBackgroundMessageHandler(
    async (remoteMessage: import('@react-native-firebase/messaging').FirebaseMessagingTypes.RemoteMessage) => {
      const data = (remoteMessage.data ?? {}) as Record<string, string>;
      const title = remoteMessage.notification?.title ?? data.title ?? 'HomeServe Pro';
      const body = remoteMessage.notification?.body ?? data.body ?? '';
      const imageUrl = remoteMessage.notification?.android?.imageUrl ?? data.imageUrl;

      await notifee.createChannel({
        id: 'default',
        name: 'Default',
        importance: AndroidImportance.HIGH,
      });

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
      });
    },
  );
}

// Boot the actual Expo Router app after the handler is registered.
require('expo-router/entry');
