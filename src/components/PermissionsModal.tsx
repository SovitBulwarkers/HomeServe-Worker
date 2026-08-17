import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Linking,
  Platform,
  PermissionsAndroid,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
// import notifee from '@notifee/react-native';
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  shadow,
  spacing,
} from "../theme";
import Button from "./Button";

interface PermissionsModalProps {
  visible: boolean;
  onComplete: () => void;
}

interface PermissionState {
  camera: boolean;
  location: boolean;
  notifications: boolean;
}

function withTimeout<T>(
  promise: Promise<T>,
  fallback: T,
  ms = 2500,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default function PermissionsModal({
  visible,
  onComplete,
}: PermissionsModalProps) {
  const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState<PermissionState>({
    camera: false,
    location: false,
    notifications: false,
  });

  const checkStatus = async () => {
    try {
      const cameraRes = await withTimeout(
        ImagePicker.getCameraPermissionsAsync(),
        null,
      );
      const locationRes = await withTimeout(
        Location.getForegroundPermissionsAsync(),
        null,
      );
      let notifGranted = false;

      try {
        const notifSettings = await withTimeout(
          notifee.getNotificationSettings(),
          null,
        );
        if (notifSettings && notifSettings.authorizationStatus >= 1) {
          notifGranted = true;
        }
      } catch {}

      setPermissions({
        camera: !!cameraRes?.granted,
        location: !!locationRes?.granted,
        notifications: notifGranted,
      });
    } catch (e) {
      console.log("Error checking permissions:", e);
    }
  };

  useEffect(() => {
    if (visible) {
      checkStatus();
    }
  }, [visible]);

  const requestAllPermissions = async () => {
    setLoading(true);
    try {
      if (Platform.OS === "android") {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      }
      const camera = await withTimeout(
        ImagePicker.requestCameraPermissionsAsync(),
        null,
      );
      const location = await withTimeout(
        Location.requestForegroundPermissionsAsync(),
        null,
      );

      let notifGranted = false;
      try {
        if (Platform.OS === "android" && Platform.Version >= 33) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
        }
        const notifRes = await withTimeout(notifee.requestPermission(), null);
        if (notifRes && notifRes.authorizationStatus >= 1) {
          notifGranted = true;
        }
      } catch {}

      setPermissions({
        camera: !!camera?.granted,
        location: !!location?.granted,
        notifications: notifGranted,
      });

      const cameraDenied = camera
        ? !camera.granted && !camera.canAskAgain
        : false;
      const locationDenied = location
        ? !location.granted && !location.canAskAgain
        : false;

      if (cameraDenied || locationDenied) {
        Alert.alert(
          "Permissions Required",
          "Some permissions are disabled. You can enable them in device Settings.",
          [
            { text: "Later", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
      }
    } catch (e: any) {
      console.log("Error requesting permissions:", e);
    } finally {
      setLoading(false);
      onComplete();
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onComplete}
    >
      <Pressable style={styles.backdrop} onPress={onComplete}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handleBar} />

          <View style={styles.headerRow}>
            <View style={styles.iconHeader}>
              <Ionicons
                name="shield-checkmark"
                size={26}
                color={colors.primary}
              />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Allow App Permissions</Text>
              <Text style={styles.subtitle}>
                Required for job alerts & camera proof
              </Text>
            </View>
            <Pressable onPress={onComplete} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.permissionList}>
            <View style={styles.item}>
              <View
                style={[
                  styles.itemIcon,
                  permissions.camera && styles.itemIconGranted,
                ]}
              >
                <Ionicons
                  name="camera-outline"
                  size={20}
                  color={permissions.camera ? colors.success : colors.primary}
                />
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>Camera Access (Required)</Text>
                <Text style={styles.itemSub}>
                  Capture live selfie, document & job proof photos
                </Text>
              </View>
              {permissions.camera ? (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={colors.success}
                />
              ) : null}
            </View>

            <View style={styles.item}>
              <View
                style={[
                  styles.itemIcon,
                  permissions.location && styles.itemIconGranted,
                ]}
              >
                <Ionicons
                  name="location-outline"
                  size={20}
                  color={permissions.location ? colors.success : colors.primary}
                />
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>Location Services</Text>
                <Text style={styles.itemSub}>
                  Receive nearby job requests & navigation
                </Text>
              </View>
              {permissions.location ? (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={colors.success}
                />
              ) : null}
            </View>

            <View style={styles.item}>
              <View
                style={[
                  styles.itemIcon,
                  permissions.notifications && styles.itemIconGranted,
                ]}
              >
                <Ionicons
                  name="notifications-outline"
                  size={20}
                  color={
                    permissions.notifications ? colors.success : colors.primary
                  }
                />
              </View>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>Push Notifications</Text>
                <Text style={styles.itemSub}>
                  Get real-time job offers & customer chats
                </Text>
              </View>
              {permissions.notifications ? (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={colors.success}
                />
              ) : null}
            </View>
          </View>

          <Button
            title="Allow All Permissions"
            onPress={requestAllPermissions}
            loading={loading}
            style={styles.mainBtn}
          />

          <Pressable style={styles.skipBtn} onPress={onComplete}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === "ios" ? spacing.xxxl + 10 : spacing.xxl,
    ...shadow.raised,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  iconHeader: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionList: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  itemIconGranted: {
    backgroundColor: colors.successLight,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  mainBtn: {
    height: 52,
    borderRadius: radius.xl,
  },
  skipBtn: {
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  skipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
});
