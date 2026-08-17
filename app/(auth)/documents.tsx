import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, ScrollView, Image, Platform, PermissionsAndroid } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import Button from '../../src/components/Button';
import { useAuth } from '../../src/store/auth-context';
import { UploadAPI, WorkerAPI, WorkerDocument } from '../../src/api/endpoints';
import ImagePickerModal from '../../src/components/ImagePickerModal';

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
    label: 'Live Photo / Selfie',
    hint: 'Clear front-facing photo of your face',
    icon: 'camera-outline',
    useCamera: 'front',
  },
  {
    type: 'ID_PROOF',
    label: 'Government Photo ID',
    hint: 'Aadhaar Card, PAN Card, or Driving License',
    icon: 'card-outline',
  },
  {
    type: 'ADDRESS_PROOF',
    label: 'Address Proof',
    hint: 'Electricity Bill, Voter ID, or Utility Statement',
    icon: 'document-text-outline',
  },
];

export default function OnboardingDocuments() {
  const router = useRouter();
  const { worker, refreshWorker } = useAuth();
  const [existing, setExisting] = useState<WorkerDocument[]>(worker?.documents ?? []);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'android') {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        }
        await ImagePicker.requestCameraPermissionsAsync();
      } catch (e) {
        console.log('Pre-request camera permission error:', e);
      }
    })();
  }, []);

  const docFor = (type: string) => existing.find((d) => d.type === type);
  const uploadedCount = SLOTS.filter((s) => docFor(s.type)).length;
  const allUploaded = uploadedCount === SLOTS.length;

  const [selectedSlot, setSelectedSlot] = useState<DocSlot | null>(null);

  const handleSlotPress = (slot: DocSlot) => {
    setSelectedSlot(slot);
  };

  const handleImagePicked = async (uri: string) => {
    if (!selectedSlot) return;
    const slot = selectedSlot;
    setUploadingType(slot.type);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
        name: `${slot.type.toLowerCase()}.jpg`,
        type: 'image/jpeg',
      } as any);
      const { data } = await UploadAPI.uploadImage(formData, 'documents');
      const url = data.data?.url ?? (data as any).url;
      await WorkerAPI.uploadDocument(slot.type, url);
      setExisting((prev) => [...prev.filter((d) => d.type !== slot.type), { id: slot.type, type: slot.type, url, isVerified: false }]);
      Alert.alert('Uploaded', `${slot.label} uploaded successfully.`);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.response?.data?.message || 'Please try again.');
    } finally {
      setUploadingType(null);
      setSelectedSlot(null);
    }
  };

  const handleSubmit = async () => {
    if (!allUploaded) {
      Alert.alert('Almost there', 'Please add all required documents before submitting.');
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
        {/* Step Progress Tracker */}
        <View style={styles.topProgressRow}>
          <Text style={styles.stepText}>Step 2 of 2</Text>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
        </View>

        <Text style={styles.pageTitle}>Identity Verification</Text>
        <Text style={styles.pageSubtitle}>
          Upload documents to get verified and start receiving job requests.
        </Text>

        {/* Upload Status Banner */}
        <View style={styles.statusBanner}>
          <Ionicons
            name={allUploaded ? 'checkmark-circle' : 'time-outline'}
            size={20}
            color={allUploaded ? colors.success : colors.warning}
          />
          <Text style={styles.statusBannerText}>
            {allUploaded
              ? 'All documents uploaded. Ready for review!'
              : `${uploadedCount} of ${SLOTS.length} documents uploaded`}
          </Text>
        </View>

        {/* Document Slots */}
        <View style={styles.slotsList}>
          {SLOTS.map((slot) => {
            const doc = docFor(slot.type);
            const uploading = uploadingType === slot.type;
            return (
              <Pressable
                key={slot.type}
                onPress={() => handleSlotPress(slot)}
                style={[styles.docTile, doc && styles.docTileDone]}
              >
                <View style={[styles.iconBox, doc && styles.iconBoxDone]}>
                  {doc ? (
                    <Image source={{ uri: doc.url }} style={styles.thumbImage} />
                  ) : (
                    <Ionicons name={slot.icon} size={24} color={colors.primary} />
                  )}
                </View>

                <View style={styles.docInfo}>
                  <Text style={styles.docTitle}>{slot.label}</Text>
                  <Text style={styles.docSub}>{doc ? 'Tap to retake photo' : slot.hint}</Text>
                </View>

                <View style={styles.actionWrap}>
                  {uploading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : doc ? (
                    <View style={styles.doneBadge}>
                      <Ionicons name="checkmark" size={14} color={colors.white} />
                    </View>
                  ) : (
                    <View style={styles.uploadBtn}>
                      <Text style={styles.uploadBtnText}>Upload</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Button
          title="Submit for Approval"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!allUploaded}
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>

      <ImagePickerModal
        visible={!!selectedSlot}
        onClose={() => setSelectedSlot(null)}
        title={selectedSlot ? `Upload ${selectedSlot.label}` : 'Upload Document'}
        subtitle="Camera capture required for identity verification"
        allowFrontCamera={selectedSlot?.useCamera === 'front'}
        onImagePicked={handleImagePicked}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl * 2,
  },
  topProgressRow: {
    marginBottom: spacing.md,
  },
  stepText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#E5E0D8',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.primary,
  },
  pageTitle: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  pageSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  statusBannerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  slotsList: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  docTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docTileDone: {
    borderColor: colors.success,
    backgroundColor: '#F5FCF8',
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconBoxDone: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.success,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  docInfo: {
    flex: 1,
    marginLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  docTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  docSub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionWrap: {
    marginLeft: spacing.xs,
  },
  doneBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  uploadBtnText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
});