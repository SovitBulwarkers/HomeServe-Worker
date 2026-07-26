import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../../src/theme';
import { Input, Card } from '../../src/components/ui';
import Button from '../../src/components/Button';
import { useAuth } from '../../src/store/auth-context';
import { CatalogAPI, Category, Service, UploadAPI, WorkerAPI } from '../../src/api/endpoints';

export default function CreateProfile() {
  const router = useRouter();
  const { worker, refreshWorker } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [experience, setExperience] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Routing between onboarding steps (create-profile → documents →
  // pending-approval → tabs) is centrally handled in app/_layout.tsx, so
  // this screen doesn't need its own redirect logic.

  useEffect(() => {
    (async () => {
      try {
        const { data } = await CatalogAPI.getCategories();
        const cats = data.data ?? (data as unknown as Category[]);
        setCategories(cats);
        if (cats.length) setActiveCategory(cats[0].id);
      } catch {
        // Non-fatal — worker can still complete profile and pick services later.
      } finally {
        setLoadingCatalog(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeCategory) return;
    CatalogAPI.getServices({ categoryId: activeCategory })
      .then(({ data }) => setServices(data.data ?? (data as unknown as Service[])))
      .catch(() => setServices([]));
  }, [activeCategory]);

  const addSkill = () => {
    const v = skillInput.trim();
    if (v && !skills.includes(v)) {
      setSkills([...skills, v]);
    }
    setSkillInput('');
  };

  const removeSkill = (s: string) => setSkills(skills.filter((k) => k !== s));

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to set a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: 'avatar.jpg',
        type: 'image/jpeg',
      } as any);
      const { data } = await UploadAPI.uploadImage(formData, 'workers');
      setAvatar(data.data.url);
    } catch {
      Alert.alert('Upload failed', 'Could not upload your photo. You can add one later from your profile.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (selectedServiceIds.length === 0) {
      setError('Select at least one service you can perform');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await WorkerAPI.updateProfile({
        name: name.trim(),
        email: email.trim() || undefined,
        bio: bio.trim() || undefined,
        experience: experience ? Number(experience) : undefined,
        avatar: avatar || undefined,
      });
      if (skills.length) await WorkerAPI.updateSkills(skills);
      await WorkerAPI.updateServices(selectedServiceIds);
      await refreshWorker();
      router.replace('/(auth)/documents');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Set up your worker profile</Text>
        <Text style={styles.subheading}>
          Customers see this before booking you. Add real details so they know who's coming.
        </Text>

        <Pressable onPress={pickAvatar} style={styles.avatarWrap}>
          {uploadingAvatar ? (
            <ActivityIndicator color={colors.primary} />
          ) : avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
          )}
        </Pressable>
        <Text style={styles.avatarHint}>Tap to add a profile photo</Text>

        <Input label="Full name" placeholder="e.g. Ramesh Kumar" value={name} onChangeText={setName} />
        <Input
          label="Email (optional)"
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          label="Years of experience"
          placeholder="e.g. 3"
          keyboardType="number-pad"
          value={experience}
          onChangeText={setExperience}
        />
        <Input
          label="Short bio (optional)"
          placeholder="A line about your work"
          value={bio}
          onChangeText={setBio}
          multiline
        />

        <Text style={styles.label}>Your skills</Text>
        <View style={styles.skillInputRow}>
          <View style={{ flex: 1 }}>
            <Input
              placeholder="e.g. Pipe fitting"
              value={skillInput}
              onChangeText={setSkillInput}
              onSubmitEditing={addSkill}
              returnKeyType="done"
            />
          </View>
          <Pressable style={styles.addSkillBtn} onPress={addSkill}>
            <Ionicons name="add" size={22} color={colors.white} />
          </Pressable>
        </View>
        <View style={styles.skillChips}>
          {skills.map((s) => (
            <Pressable key={s} style={styles.skillChip} onPress={() => removeSkill(s)}>
              <Text style={styles.skillChipText}>{s}</Text>
              <Ionicons name="close" size={14} color={colors.primary} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Services you can perform</Text>
        {loadingCatalog ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setActiveCategory(c.id)}
                  style={[styles.categoryChip, activeCategory === c.id && styles.categoryChipActive]}
                >
                  <Text style={[styles.categoryChipText, activeCategory === c.id && styles.categoryChipTextActive]}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {services.map((s) => {
                const selected = selectedServiceIds.includes(s.id);
                return (
                  <Card key={s.id} onPress={() => toggleService(s.id)} style={styles.serviceCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.serviceName}>{s.name}</Text>
                    </View>
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={selected ? colors.primary : colors.textMuted}
                    />
                  </Card>
                );
              })}
              {services.length === 0 ? (
                <Text style={styles.emptyServices}>No services in this category yet.</Text>
              ) : null}
            </View>
          </>
        )}

        {selectedServiceIds.length > 0 ? (
          <Text style={styles.selectedCount}>{selectedServiceIds.length} service(s) selected</Text>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button title="Submit for review" onPress={handleSubmit} loading={saving} style={{ marginTop: spacing.xl }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xxl, paddingBottom: spacing.xxxl * 2 },
  heading: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: spacing.sm },
  subheading: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 21, marginBottom: spacing.xl },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    overflow: 'hidden',
    ...shadow.subtle,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarHint: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.sm, marginBottom: spacing.xl },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.sm },
  skillInputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  addSkillBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skillChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  skillChipText: { color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
  categoryRow: { marginBottom: spacing.sm },
  categoryChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { color: colors.textSecondary, fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
  categoryChipTextActive: { color: colors.white },
  serviceCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  serviceName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  emptyServices: { color: colors.textMuted, fontSize: fontSize.sm, paddingVertical: spacing.md },
  selectedCount: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.md },
  errorText: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.md },
});