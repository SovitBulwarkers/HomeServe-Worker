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
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Input } from '../../src/components/ui';
import Button from '../../src/components/Button';
import { useAuth } from '../../src/store/auth-context';
import { CatalogAPI, Category, Service, UploadAPI, WorkerAPI } from '../../src/api/endpoints';
import ImagePickerModal from '../../src/components/ImagePickerModal';

export default function CreateProfile() {
  const router = useRouter();
  const { refreshWorker } = useAuth();

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

  useEffect(() => {
    (async () => {
      try {
        const { data } = await CatalogAPI.getCategories();
        const cats = data.data ?? (data as unknown as Category[]);
        setCategories(cats);
        if (cats.length) setActiveCategory(cats[0].id);
      } catch {
        // Non-fatal
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

  const [showPickerModal, setShowPickerModal] = useState(false);

  const handleAvatarPicked = async (uri: string) => {
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
        name: 'avatar.jpg',
        type: 'image/jpeg',
      } as any);
      const { data } = await UploadAPI.uploadImage(formData, 'workers');
      const url = data.data?.url ?? (data as any).url;
      setAvatar(url);
    } catch {
      Alert.alert('Upload failed', 'Could not upload photo.');
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
      setError('Select at least one service you provide');
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
      setError(e?.response?.data?.message || 'Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Step Header Indicator */}
          <View style={styles.topProgressRow}>
            <Text style={styles.stepText}>Step 1 of 2</Text>
            <View style={styles.progressTrack}>
              <View style={styles.progressFill} />
            </View>
          </View>

          <Text style={styles.pageTitle}>Partner Details</Text>
          <Text style={styles.pageSubtitle}>Set up your public profile to receive local jobs</Text>

          {/* Photo Uploader */}
          <View style={styles.photoRow}>
            <Pressable onPress={() => setShowPickerModal(true)} style={styles.avatarCircle}>
              {uploadingAvatar ? (
                <ActivityIndicator color={colors.primary} />
              ) : avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person-outline" size={30} color={colors.textSecondary} />
              )}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.photoLabel}>{avatar ? 'Profile Photo Added' : 'Add Profile Photo'}</Text>
              <Pressable onPress={() => setShowPickerModal(true)}>
                <Text style={styles.photoActionText}>{avatar ? 'Tap to change' : 'Upload photo'}</Text>
              </Pressable>
            </View>
          </View>

          {/* Input Fields */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name *</Text>
            <Input
              placeholder="e.g. Ramesh Kumar"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email (Optional)</Text>
            <Input
              placeholder="ramesh@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Years of Experience</Text>
            <Input
              placeholder="e.g. 4"
              keyboardType="number-pad"
              value={experience}
              onChangeText={setExperience}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Short Bio (Optional)</Text>
            <Input
              placeholder="Experienced plumber serving South Delhi"
              value={bio}
              onChangeText={setBio}
              multiline
            />
          </View>

          {/* Skills Pill Section */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Skills & Expertise</Text>
            <View style={styles.skillInputRow}>
              <View style={{ flex: 1 }}>
                <Input
                  placeholder="e.g. Leak repair, Tap fitting"
                  value={skillInput}
                  onChangeText={setSkillInput}
                  onSubmitEditing={addSkill}
                  returnKeyType="done"
                />
              </View>
              <Pressable style={styles.addSkillBtn} onPress={addSkill}>
                <Ionicons name="add" size={20} color={colors.white} />
              </Pressable>
            </View>

            {skills.length > 0 && (
              <View style={styles.skillsWrap}>
                {skills.map((s) => (
                  <Pressable key={s} style={styles.skillBadge} onPress={() => removeSkill(s)}>
                    <Text style={styles.skillBadgeText}>{s}</Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Services Selection - Interactive Grid */}
          <View style={styles.inputGroup}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.label}>Services You Offer *</Text>
              {selectedServiceIds.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{selectedServiceIds.length} Selected</Text>
                </View>
              )}
            </View>

            {loadingCatalog ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
            ) : (
              <>
                {/* Category Pills */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catTabsScroll}>
                  {categories.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setActiveCategory(c.id)}
                      style={[styles.catPill, activeCategory === c.id && styles.catPillActive]}
                    >
                      <Text style={[styles.catPillText, activeCategory === c.id && styles.catPillTextActive]}>
                        {c.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {/* Service Cards */}
                <View style={styles.servicesGrid}>
                  {services.map((s) => {
                    const selected = selectedServiceIds.includes(s.id);
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => toggleService(s.id)}
                        style={[styles.serviceCard, selected && styles.serviceCardSelected]}
                      >
                        <View style={styles.serviceInfo}>
                          <Text style={[styles.serviceTitle, selected && styles.serviceTitleSelected]}>
                            {s.name}
                          </Text>
                          {s.description ? (
                            <Text style={styles.serviceDesc} numberOfLines={2}>
                              {s.description}
                            </Text>
                          ) : null}
                        </View>
                        <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
                          <Ionicons
                            name={selected ? 'checkmark' : 'add'}
                            size={16}
                            color={selected ? colors.white : colors.textMuted}
                          />
                        </View>
                      </Pressable>
                    );
                  })}
                  {services.length === 0 && (
                    <Text style={styles.emptyText}>No services available in this category.</Text>
                  )}
                </View>
              </>
            )}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            title="Next: Upload Documents"
            onPress={handleSubmit}
            loading={saving}
            style={{ marginTop: spacing.lg }}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <ImagePickerModal
        visible={showPickerModal}
        onClose={() => setShowPickerModal(false)}
        title="Upload Photo"
        subtitle="Take a clear selfie with your phone camera"
        allowFrontCamera
        onImagePicked={handleAvatarPicked}
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
    width: '50%',
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
    marginBottom: spacing.xl,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F0ECE4',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  photoLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  photoActionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.primary,
    marginTop: 2,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  skillInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addSkillBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  skillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillBadgeText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  catTabsScroll: {
    marginBottom: spacing.md,
  },
  catPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  catPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catPillText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  catPillTextActive: {
    color: colors.white,
    fontWeight: fontWeight.bold,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  countBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  countBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  servicesGrid: {
    gap: spacing.sm,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  serviceCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#FFF8F2',
  },
  serviceInfo: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  serviceTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  serviceTitleSelected: {
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
  },
  serviceDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  checkCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
});