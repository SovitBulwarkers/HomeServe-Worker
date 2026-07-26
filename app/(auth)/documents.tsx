import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../../src/theme';
import Button from '../../src/components/Button';
import { useAuth } from '../../src/store/auth-context';
import { UploadAPI, WorkerAPI, WorkerDocument } from '../../src/api/endpoints';

interface DocSlot {
  type: string;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  useCamera?: 'front' | 'back';
}

const SLOTS: DocSlot[] = [
  {
    type: 'SELFIE',
    label: 'Live selfie',
    hint: 'Take a clear photo of your face',
    icon: 'camera-outline',
    useCamera: 'front',
  },
  {
    type: 'ID_PROOF',
    label: 'Government ID',
    hint: 'Aadhaar, PAN or driving licence',
    icon: 'card-outline',
  },
  {
    type: 'ADDRESS_PROOF',
    label: 'Address proof',
    hint: 'Utility bill, ration card, etc.',
    icon: 'home-outline',
  },
];

export default function OnboardingDocuments() {
  const router = useRouter();
  const { worker, refreshWorker } = useAuth();
  const [existing, setExisting] = useState<WorkerDocument[]>(worker?.documents ?? []);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const docFor = (type: string) => existing.find((d) => d.type === type);
  const allUploaded = SLOTS.every((s) => docFor(s.type));

  const captureAndUpload = useCallback(async (slot: DocSlot) => {
    let result: ImagePicker.ImagePickerResult;
    if (slot.useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera permission needed', 'Allow camera access to take your selfie.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        cameraType: slot.useCamera === 'front' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
    } else {
      Alert.alert(
        `Add ${slot.label}`,
        'Take a photo or choose one from your gallery',
        [
          { text: 'Camera', onPress: () => openCamera(slot) },
          { text: 'Gallery', onPress: () => openGallery(slot) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;
    await upload(slot, result.assets[0].uri);
  }, [existing]);

  const openCamera = async (slot: DocSlot) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true });
    if (result.canceled || !result.assets?.[0]) return;
    await upload(slot, result.assets[0].uri);
  };

  const openGallery = async (slot: DocSlot) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to upload a document.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    await upload(slot, result.assets[0].uri);
  };

  const upload = async (slot: DocSlot, uri: string) => {
    setUploadingType(slot.type);
    try {
      const formData = new FormData();
      formData.append('file', { uri, name: `${slot.type.toLowerCase()}.jpg`, type: 'image/jpeg' } as any);
      const { data } = await UploadAPI.uploadImage(formData, 'worker-documents');
      await WorkerAPI.uploadDocument(slot.type, data.data.url);
      setExisting((prev) => [...prev.filter((d) => d.type !== slot.type), { id: slot.type, type: slot.type, url: data.data.url, isVerified: false }]);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.response?.data?.message || 'Please try again.');
    } finally {
      setUploadingType(null);
    }
  };

  const handleSubmit = async () => {
    if (!allUploaded) {
      Alert.alert('Almost there', 'Please add all three documents before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      await refreshWorker();
      router.replace('/pending-approval');
    } catch {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Verify your identity</Text>
        <Text style={styles.subheading}>
          Admins review these before your account can start accepting jobs. This usually takes less than 24 hours.
        </Text>

        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {SLOTS.map((slot) => {
            const doc = docFor(slot.type);
            const uploading = uploadingType === slot.type;
            return (
              <Pressable key={slot.type} onPress={() => captureAndUpload(slot)} style={styles.docCard}>
                <View style={styles.docThumb}>
                  {doc ? (
                    <Image source={{ uri: doc.url }} style={styles.docThumbImage} />
                  ) : (
                    <Ionicons name={slot.icon} size={22} color={colors.primary} />
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.docLabel}>{slot.label}</Text>
                  <Text style={styles.docHint}>{doc ? 'Uploaded — tap to retake' : slot.hint}</Text>
                </View>
                {uploading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : doc ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                ) : (
                  <Ionicons name={slot.useCamera ? 'camera' : 'cloud-upload-outline'} size={20} color={colors.textMuted} />
                )}
              </Pressable>
            );
          })}
        </View>

        <Button
          title="Submit for review"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!allUploaded}
          style={{ marginTop: spacing.xxl }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xxl, paddingBottom: spacing.xxxl * 2 },
  heading: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: spacing.sm },
  subheading: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 21 },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.subtle,
  },
  docThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  docThumbImage: { width: '100%', height: '100%' },
  docLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  docHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});