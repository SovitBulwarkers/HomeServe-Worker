import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, FlatList, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Card, StatusPill } from '../../src/components/ui';
import { UploadAPI, WorkerAPI, WorkerDocument } from '../../src/api/endpoints';
import ImagePickerModal from '../../src/components/ImagePickerModal';

const REQUIRED_DOCS = [
  { type: 'PROFILE_PHOTO', label: 'Live selfie', useCamera: 'front' as const },
  { type: 'AADHAAR_FRONT', label: 'Aadhaar Card — Front' },
  { type: 'AADHAAR_BACK', label: 'Aadhaar Card — Back' },
  { type: 'PAN_CARD', label: 'PAN Card' },
  { type: 'POLICE_VERIFICATION', label: 'Police verification (optional)' },
];

export default function Documents() {
  const router = useRouter();
  const [documents, setDocuments] = useState<WorkerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<typeof REQUIRED_DOCS[0] | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await WorkerAPI.getDocuments();
      setDocuments(data.data ?? []);
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleImagePicked = async (uri: string) => {
    if (!selectedDoc) return;
    const doc = selectedDoc;
    setUploadingType(doc.type);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
        name: `${doc.type.toLowerCase()}.jpg`,
        type: 'image/jpeg',
      } as any);
      const { data } = await UploadAPI.uploadImage(formData, 'documents');
      const url = data.data?.url ?? (data as any).url;
      await WorkerAPI.uploadDocument(doc.type, url);
      await load();
      Alert.alert('Uploaded', `${doc.label} submitted for review.`);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.response?.data?.message || 'Please try again.');
    } finally {
      setUploadingType(null);
      setSelectedDoc(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Documents</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={REQUIRED_DOCS}
          keyExtractor={(d) => d.type}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const existing = documents.find((d) => d.type === item.type);
            return (
              <Card onPress={() => setSelectedDoc(item)} style={styles.docCard}>
                <Ionicons
                  name={(item as any).useCamera ? 'camera-outline' : 'document-text-outline'}
                  size={22}
                  color={colors.primary}
                />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.docLabel}>{item.label}</Text>
                  {existing ? (
                    <StatusPill label={existing.isVerified ? 'Verified' : 'Pending review'} tone={existing.isVerified ? 'success' : 'warning'} />
                  ) : (
                    <Text style={styles.docHint}>Not uploaded</Text>
                  )}
                </View>
                {uploadingType === item.type ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name={existing ? 'refresh' : 'cloud-upload-outline'} size={20} color={colors.textMuted} />
                )}
              </Card>
            );
          }}
        />
      )}

      <ImagePickerModal
        visible={!!selectedDoc}
        onClose={() => setSelectedDoc(null)}
        title={selectedDoc ? `Upload ${selectedDoc.label}` : 'Upload Document'}
        subtitle="Select photo source to upload document"
        allowFrontCamera={selectedDoc?.useCamera === 'front'}
        onImagePicked={handleImagePicked}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  list: { padding: spacing.xxl, gap: spacing.md },
  docCard: { flexDirection: 'row', alignItems: 'center' },
  docLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: 4 },
  docHint: { fontSize: fontSize.xs, color: colors.textMuted },
});