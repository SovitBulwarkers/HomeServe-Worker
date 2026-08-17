import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { Card } from '../../src/components/ui';
import { WorkerAPI } from '../../src/api/endpoints';

/**
 * Date-specific availability ("mark a day off"), backed by real server
 * state now that the backend has:
 *  - GET  /workers/availability        — list the worker's own blocked dates
 *  - POST /workers/availability        — upsert a date's isOff (one row per date)
 *  - DELETE /workers/availability/:date — un-block a date outright
 * (previously POST was insert-only with no list/delete, so this screen
 * had to fall back to an on-device cache — that's gone now.)
 */

const DAYS_AHEAD = 21;

// Formats a Date's own LOCAL calendar day as "YYYY-MM-DD" — deliberately
// NOT `d.toISOString().slice(0, 10)`, which reads UTC date parts instead.
// `d` here always carries the day we mean via its local getFullYear/
// getMonth/getDate (see upcomingDates below and toLocaleDateString in the
// render), so converting through UTC first silently shifts it back a day
// for any positive UTC offset — which IST (UTC+5:30) always is. That
// mismatch would send/store a different calendar day than the one shown
// on screen, and the backend's startOfDayIST() would then block off the
// wrong IST day server-side.
function dateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// The backend stores each blocked date as the UTC instant of IST
// midnight (see startOfDayIST on the server) — which, since IST is
// UTC+5:30, always serializes back as 18:30 the PREVIOUS UTC calendar
// day. Reading the UTC date parts straight off that string (a plain
// `.slice(0, 10)`) would recover the wrong day and silently disagree
// with dateKey() above. Mirror the server's own shift-then-read-UTC-
// parts technique instead, so this always recovers the same IST
// calendar day the server actually blocked.
const IST_OFFSET_MINUTES = 5 * 60 + 30;
function istDateKeyFromIso(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + IST_OFFSET_MINUTES * 60000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function upcomingDates(): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    out.push(d);
  }
  return out;
}

export default function AvailabilityScreen() {
  const router = useRouter();
  const dates = upcomingDates();
  const [blocked, setBlocked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = dates[0];
      const to = dates[dates.length - 1];
      const res: any = await WorkerAPI.getAvailability(dateKey(from), dateKey(to));
      const list = res?.data?.data ?? res?.data?.availability ?? res?.data ?? [];
      const map: Record<string, boolean> = {};
      if (Array.isArray(list)) {
        for (const entry of list) {
          const isOff = entry.isOff ?? (entry.isAvailable === false) ?? (entry.status === 'OFF');
          const dStr = entry.date || entry.day || entry.startDate;
          if (isOff && dStr) {
            map[istDateKeyFromIso(dStr)] = true;
          }
        }
      }
      setBlocked(map);
    } catch {
      setBlocked({});
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleDate = async (d: Date) => {
    const key = dateKey(d);
    const currentlyOff = !!blocked[key];
    setSavingKey(key);
    try {
      if (currentlyOff) {
        await WorkerAPI.clearAvailability(key);
        setBlocked((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        await WorkerAPI.setAvailability(key, true);
        setBlocked((prev) => ({ ...prev, [key]: true }));
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || "Couldn't update this date. Please try again.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Availability</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.noteBox}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.noteText}>
          Mark specific dates off — e.g. a holiday or personal day — separate from your regular weekly hours.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {dates.map((d) => {
            const key = dateKey(d);
            const isOff = !!blocked[key];
            const isSaving = savingKey === key;
            return (
              <Card key={key} style={styles.dayRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dayLabel}>
                    {d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                  <Text style={[styles.dayStatus, isOff && styles.dayStatusOff]}>
                    {isOff ? 'Marked off' : 'Available'}
                  </Text>
                </View>
                <Pressable
                  style={[styles.toggleBtn, isOff && styles.toggleBtnOff]}
                  onPress={() => toggleDate(d)}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color={isOff ? colors.white : colors.primary} />
                  ) : (
                    <Text style={[styles.toggleBtnText, isOff && styles.toggleBtnTextOff]}>
                      {isOff ? 'Mark available' : 'Mark off'}
                    </Text>
                  )}
                </Pressable>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    marginHorizontal: spacing.xxl,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  noteText: { flex: 1, fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 16 },
  content: { padding: spacing.xxl, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.xxxl },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  dayStatus: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  dayStatusOff: { color: colors.danger, fontWeight: fontWeight.semibold },
  toggleBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  toggleBtnOff: { backgroundColor: colors.danger, borderColor: colors.danger },
  toggleBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  toggleBtnTextOff: { color: colors.white },
});
