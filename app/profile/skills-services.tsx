import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Card, Input } from '../../src/components/ui';
import Button from '../../src/components/Button';
import { useAuth } from '../../src/store/auth-context';
import { CatalogAPI, Category, Service, WorkerAPI } from '../../src/api/endpoints';

export default function SkillsServices() {
  const router = useRouter();
  const { worker, refreshWorker } = useAuth();
  const [skills, setSkills] = useState<string[]>((worker?.skills ?? []).map((s) => s.skill));
  const [skillInput, setSkillInput] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(
    (worker?.services ?? []).map((s) => s.serviceId),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    CatalogAPI.getCategories()
      .then(({ data }) => {
        const cats = data.data ?? [];
        setCategories(cats);
        if (cats.length) setActiveCategory(cats[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeCategory) return;
    CatalogAPI.getServices({ categoryId: activeCategory }).then(({ data }) => setServices(data.data ?? []));
  }, [activeCategory]);

  const addSkill = () => {
    const v = skillInput.trim();
    if (v && !skills.includes(v)) setSkills([...skills, v]);
    setSkillInput('');
  };

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const save = async () => {
    setSaving(true);
    try {
      await WorkerAPI.updateSkills(skills);
      await WorkerAPI.updateServices(selectedServiceIds);
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
        <Text style={styles.headerTitle}>Skills & services</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Your skills</Text>
        <View style={styles.skillInputRow}>
          <View style={{ flex: 1 }}>
            <Input placeholder="e.g. Pipe fitting" value={skillInput} onChangeText={setSkillInput} onSubmitEditing={addSkill} returnKeyType="done" />
          </View>
          <Pressable style={styles.addSkillBtn} onPress={addSkill}>
            <Ionicons name="add" size={22} color={colors.white} />
          </Pressable>
        </View>
        <View style={styles.skillChips}>
          {skills.map((s) => (
            <Pressable key={s} style={styles.skillChip} onPress={() => setSkills(skills.filter((k) => k !== s))}>
              <Text style={styles.skillChipText}>{s}</Text>
              <Ionicons name="close" size={14} color={colors.primary} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Services you offer</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
              {categories.map((c) => (
                <Pressable key={c.id} onPress={() => setActiveCategory(c.id)} style={[styles.categoryChip, activeCategory === c.id && styles.categoryChipActive]}>
                  <Text style={[styles.categoryChipText, activeCategory === c.id && styles.categoryChipTextActive]}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {services.map((s) => {
                const selected = selectedServiceIds.includes(s.id);
                return (
                  <Card key={s.id} onPress={() => toggleService(s.id)} style={styles.serviceCard}>
                    <Text style={styles.serviceName}>{s.name}</Text>
                    <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? colors.primary : colors.textMuted} />
                  </Card>
                );
              })}
            </View>
          </>
        )}

        <Button title="Save changes" onPress={save} loading={saving} style={{ marginTop: spacing.xl }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  content: { padding: spacing.xxl, paddingBottom: spacing.xxxl * 2 },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing.sm },
  skillInputRow: { flexDirection: 'row', gap: spacing.sm },
  addSkillBtn: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  skillChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  skillChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primaryLight, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  skillChipText: { color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
  categoryRow: { marginBottom: spacing.sm },
  categoryChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { color: colors.textSecondary, fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
  categoryChipTextActive: { color: colors.white },
  serviceCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  serviceName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
});