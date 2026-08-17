import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  Linking,
  PermissionsAndroid,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, fontSize, fontWeight, radius, shadow, spacing } from '../theme';
import Button from './Button';

interface ImagePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onImagePicked: (uri: string) => void;
  title?: string;
  subtitle?: string;
  allowFrontCamera?: boolean;
}

export default function ImagePickerModal({
  visible,
  onClose,
  onImagePicked,
  title = 'Take Live Photo',
  subtitle = 'Camera capture required for security verification',
  allowFrontCamera = false,
}: ImagePickerModalProps) {
  // Guards against the camera being launched more than once for a single
  // "Open Camera" tap — without this, a fast double-tap (or a tap right as
  // the 250ms teardown timer above is about to fire) queues two
  // launchCameraAsync calls. The second call either opens a stacked camera
  // screen behind/over the first, or throws because the first is still
  // active, both of which look like "the camera opens when it shouldn't."
  // Also reset whenever the modal is re-shown, so a launch that got
  // interrupted (e.g. user backgrounded the app) doesn't permanently wedge
  // the button in a disabled state next time it's opened.
  const launchingRef = React.useRef(false);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (visible) {
      launchingRef.current = false;
      setLaunching(false);
    }
  }, [visible]);

  // Plain View instead of RN <Modal> means the hardware back button no
  // longer closes this automatically — wire it up manually.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const handleCamera = () => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    setLaunching(true);

    onClose();
    // No native <Modal> teardown to race against anymore — this run-loop
    // tick just lets the overlay unmount before the camera Activity launches.
    setTimeout(async () => {
      try {
        let granted = false;
        if (Platform.OS === 'android') {
          const androidStatus = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA,
          );
          granted = androidStatus === PermissionsAndroid.RESULTS.GRANTED;
        }

        if (!granted) {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          granted = status === 'granted';
        }

        if (!granted) {
          Alert.alert(
            'Camera Access Required',
            'Camera permission is required to take photos for identity verification. Please enable camera access in Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
          allowsEditing: Platform.OS === 'ios',
          cameraType: allowFrontCamera ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
        });

        if (!result.canceled && result.assets?.[0]?.uri) {
          onImagePicked(result.assets[0].uri);
        }
      } catch (e: any) {
        console.log('Camera error:', e);
        Alert.alert('Camera Error', e?.message || 'Failed to open camera.');
      } finally {
        // Released after the camera activity fully returns (picked,
        // cancelled, or errored) — not right after launch — so a stray
        // extra tap while the camera is genuinely still open is a no-op
        // instead of a second launch.
        launchingRef.current = false;
        setLaunching(false);
      }
    }, 250);
  };

  // Deliberately NOT wrapped in RN's <Modal>. Modal is backed by a native
  // Android Dialog window; launching the camera Activity while that
  // window is still tearing down races with it and the OS silently
  // cancels the camera intent (symptom: sheet closes, nothing else
  // happens). A plain absolutely-positioned overlay has no native window
  // to conflict with, so the camera opens reliably every time.
  if (!visible) return null;

  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handleBar} />
          
          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.noticeBox}>
            <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
            <Text style={styles.noticeText}>
              Gallery uploads are disabled to prevent fraud. Only live camera photos are accepted.
            </Text>
          </View>

          <View style={styles.actionWrap}>
            <Button
              title="Open Camera"
              icon={<Ionicons name="camera" size={20} color={colors.white} />}
              onPress={handleCamera}
              disabled={launching}
              style={styles.cameraBtn}
            />

            <Button
              title="Cancel"
              variant="outline"
              onPress={onClose}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxxl + 10 : spacing.xxl,
    ...shadow.raised,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: radius.xl,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  noticeText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.primaryDark,
    fontWeight: fontWeight.bold,
    lineHeight: 16,
  },
  actionWrap: {
    gap: spacing.xs,
  },
  cameraBtn: {
    height: 52,
    borderRadius: radius.xl,
  },
});