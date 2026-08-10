import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  Linking,
  PermissionsAndroid,
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

  const handleCamera = () => {
    onClose();
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
      }
    }, 250);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
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
    </Modal>
  );
}

const styles = StyleSheet.create({
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
