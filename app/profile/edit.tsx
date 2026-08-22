import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, shadow } from '../../src/theme';
import { Input } from '../../src/components/ui';
import Button from '../../src/components/Button';
import { useAuth } from '../../src/store/auth-context';
import { UploadAPI, WorkerAPI } from '../../src/api/endpoints';
import ImagePickerModal from '../../src/components/ImagePickerModal';

// The handful of languages HomeServe currently supports for customer-facing
// worker profiles. Backend just stores a free-form language code string, so
// this is intentionally a small curated list rather than every locale.
const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'or', label: 'Odia' },
  { code: 'bn', label: 'Bengali' },
  { code: 'te', label: 'Telugu' },
  { code: 'ta', label: 'Tamil' },
];

export default function EditProfile() {
  const router = useRouter();
  const { worker, refreshWorker } = useAuth();
  const [name, setName] = useState(worker?.name ?? '');
  const [email, setEmail] = useState(worker?.email ?? '');
  const [bio, setBio] = useState(worker?.bio ?? '');
  const [experience, setExperience] = useState(String(worker?.experience ?? ''));
  const [serviceRadius, setServiceRadius] = useState(String(worker?.serviceRadius ?? '5'));
  const [language, setLanguage] = useState(worker?.language ?? 'en');
  const [avatar, setAvatar] = useState(worker?.avatar ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPickerModal, setShowPickerModal] = useState(false);

  const handleAvatarPicked = async (uri: string) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
        name: 'avatar.jpg',
        type: 'image/jpeg',
      } as any);
      const { data } = await UploadAPI.uploadImage(formData, 'avatars');
      const url = data.data?.url ?? (data as any).url;
      setAvatar(url);
    } catch {
      Alert.alert('Upload failed', 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Name required');
      return;
    }
    setSaving(true);
    try {
      await WorkerAPI.updateProfile({
        name: name.trim(),
        email: email.trim() || undefined,
        bio: bio.trim() || undefined,
        experience: experience ? Number(experience) : undefined,
        serviceRadius: serviceRadius ? Number(serviceRadius) : undefined,
        language,
        avatar: avatar || undefined,
      });
      await refreshWorker();
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e?.response?.data?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit profile</Text>
        <View style={{ width: 40 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => setShowPickerModal(true)} style={styles.avatarWrap}>
          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
          )}
        </Pressable>

        <Input label="Full name" value={name} onChangeText={setName} />
        <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Input label="Bio" value={bio} onChangeText={setBio} multiline />
        <Input label="Years of experience" value={experience} onChangeText={setExperience} keyboardType="number-pad" />
        <Input label="Service radius (km)" value={serviceRadius} onChangeText={setServiceRadius} keyboardType="number-pad" />

        <Text style={styles.fieldLabel}>Preferred language</Text>
        <View style={styles.languageRow}>
          {LANGUAGE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.code}
              onPress={() => setLanguage(opt.code)}
              style={[styles.languageChip, language === opt.code && styles.languageChipActive]}
            >
              <Text style={[styles.languageChipText, language === opt.code && styles.languageChipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Button title="Save changes" onPress={save} loading={saving} style={{ marginTop: spacing.md }} />
      </ScrollView>
      </KeyboardAvoidingView>

      <ImagePickerModal
        visible={showPickerModal}
        onClose={() => setShowPickerModal(false)}
        title="Change Profile Photo"
        subtitle="Take a live picture with your camera"
        allowFrontCamera
        onImagePicked={handleAvatarPicked}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  content: { padding: spacing.xxl, paddingBottom: spacing.xxxl * 2 },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    overflow: 'hidden',
    marginBottom: spacing.xl,
    ...shadow.subtle,
  },
  avatarImage: { width: '100%', height: '100%' },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.xs },
  languageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  languageChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  languageChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  languageChipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium },
  languageChipTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
});