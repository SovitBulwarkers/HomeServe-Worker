import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Card, StatusPill } from '../../src/components/ui';
import { UploadAPI, WorkerAPI, WorkerDocument } from '../../src/api/endpoints';

const REQUIRED_DOCS = [
  { type: 'SELFIE', label: 'Live selfie', useCamera: 'front' as const },
  { type: 'ID_PROOF', label: 'Government ID (Aadhaar / PAN)' },
  { type: 'ADDRESS_PROOF', label: 'Address proof' },
  { type: 'CERTIFICATE', label: 'Trade certificate (optional)' },
];

export default function Documents() {
  const router = useRouter();
  const [documents, setDocuments] = useState<WorkerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

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

  const uploadDoc = async (type: string, useCamera?: 'front' | 'back') => {
    let result: ImagePicker.ImagePickerResult;
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera permission needed', 'Allow camera access to take your selfie.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        cameraType: useCamera === 'front' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo library access to upload documents.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    }
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingType(type);
    try {
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('file', { uri: asset.uri, name: `${type}.jpg`, type: 'image/jpeg' } as any);
      const { data } = await UploadAPI.uploadImage(formData, 'documents');
      await WorkerAPI.uploadDocument(type, data.data.url);
      await load();
      Alert.alert('Uploaded', 'Your document was submitted for review.');
    } catch (e: any) {
      Alert.alert('Upload failed', e?.response?.data?.message || 'Please try again.');
    } finally {
      setUploadingType(null);
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
              <Card onPress={() => uploadDoc(item.type, (item as any).useCamera)} style={styles.docCard}>
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