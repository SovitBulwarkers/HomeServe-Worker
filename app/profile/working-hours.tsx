import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing } from '../../src/theme';
import { Card, Input, ToggleRow } from '../../src/components/ui';
import Button from '../../src/components/Button';
import { WorkerAPI } from '../../src/api/endpoints';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DayHours {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isOff: boolean;
}

const DEFAULT_HOURS: DayHours[] = DAYS.map((_, i) => ({
  dayOfWeek: i,
  startTime: '09:00',
  endTime: '18:00',
  isOff: i === 0,
}));

export default function WorkingHours() {
  const router = useRouter();
  const [hours, setHours] = useState<DayHours[]>(DEFAULT_HOURS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    WorkerAPI.getWorkingHours()
      .then(({ data }: any) => {
        const existing: DayHours[] = data.data ?? data;
        if (Array.isArray(existing) && existing.length === 7) {
          setHours(existing);
        }
      })
      .catch(() => {
        // Non-fatal — falls back to sensible defaults (Mon–Sat, 9–6).
      })
      .finally(() => setLoading(false));
  }, []);

  const updateDay = (idx: number, patch: Partial<DayHours>) => {
    setHours((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const save = async () => {
    setSaving(true);
    try {
      await WorkerAPI.setWorkingHours(hours);
      Alert.alert('Saved', 'Your working hours have been updated.');
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
        <Text style={styles.headerTitle}>Working hours</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content}>
          {hours.map((d, idx) => (
            <Card key={d.dayOfWeek} style={styles.dayCard}>
              <ToggleRow
                label={DAYS[d.dayOfWeek]}
                subtitle={d.isOff ? 'Day off' : `${d.startTime} - ${d.endTime}`}
                value={!d.isOff}
                onValueChange={(v) => updateDay(idx, { isOff: !v })}
              />
              {!d.isOff ? (
                <View style={styles.timeRow}>
                  <View style={{ flex: 1 }}>
                    <Input label="Start" value={d.startTime} onChangeText={(v) => updateDay(idx, { startTime: v })} placeholder="09:00" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input label="End" value={d.endTime} onChangeText={(v) => updateDay(idx, { endTime: v })} placeholder="18:00" />
                  </View>
                </View>
              ) : null}
            </Card>
          ))}
          <Button title="Save working hours" onPress={save} loading={saving} style={{ marginTop: spacing.md }} />
        </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  content: { padding: spacing.xxl, gap: spacing.md, paddingBottom: spacing.xxxl * 2 },
  dayCard: {},
  timeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});