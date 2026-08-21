// Safe wrapper around native push notification modules (@react-native-firebase/messaging and @notifee/react-native)
// Uses native modules when available (production APK, preview APK, dev client) and provides safe fallbacks in Expo Go.

const dummyMessaging = () => ({
  requestPermission: async () => 1,
  getToken: async () => null,
  onTokenRefresh: () => () => {},
  onMessage: () => () => {},
  setBackgroundMessageHandler: () => {},
});
(dummyMessaging as any).AuthorizationStatus = { AUTHORIZED: 1, DENIED: 0 };

const dummyNotifee = {
  createChannel: async () => "default",
  displayNotification: async () => "id",
  requestPermission: async () => ({ authorizationStatus: 1 }),
  getNotificationSettings: async () => ({ authorizationStatus: 1 }),
  onForegroundEvent: () => () => {},
  onBackgroundEvent: () => () => {},
  getInitialNotification: async () => null,
};

let safeMessaging: any = dummyMessaging;
let safeNotifee: any = dummyNotifee;
let safeAndroidImportance: any = { HIGH: 4, DEFAULT: 3, LOW: 2 };
let safeAndroidStyle: any = { BIGPICTURE: 0 };
let safeEventType: any = { PRESS: 1, DISMISSED: 0 };

let hasRNFB = false;
let hasNotifee = false;

try {
  const mod = require("@react-native-firebase/messaging");
  const msgFunc = mod.default || mod;
  if (typeof msgFunc === "function") {
    safeMessaging = msgFunc;
    hasRNFB = true;
  }
} catch (e) {
  console.warn(
    "[safeNotifications] Firebase messaging native module load failed:",
    e,
  );
}

try {
  const notifeeMod = require("@notifee/react-native");
  const notifeeObj = notifeeMod.default || notifeeMod;
  if (notifeeObj && typeof notifeeObj.displayNotification === "function") {
    safeNotifee = notifeeObj;
    if (notifeeMod.AndroidImportance)
      safeAndroidImportance = notifeeMod.AndroidImportance;
    if (notifeeMod.AndroidStyle) safeAndroidStyle = notifeeMod.AndroidStyle;
    if (notifeeMod.EventType) safeEventType = notifeeMod.EventType;
    hasNotifee = true;
  }
} catch (e) {
  console.warn("[safeNotifications] Notifee native module load failed:", e);
}

export const messaging = safeMessaging;
export const notifee = safeNotifee;
export const AndroidImportance = safeAndroidImportance;
export const AndroidStyle = safeAndroidStyle;
export const EventType = safeEventType;
export const isNativeNotificationSupported = hasRNFB && hasNotifee;

