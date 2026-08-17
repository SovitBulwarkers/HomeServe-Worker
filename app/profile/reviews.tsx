import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing } from '../../src/theme';
import { Card, EmptyState } from '../../src/components/ui';
import { useAuth } from '../../src/store/auth-context';
import { WorkerAPI, WorkerReview } from '../../src/api/endpoints';

export default function WorkerReviews() {
  const router = useRouter();
  const { worker } = useAuth();
  const [reviews, setReviews] = useState<WorkerReview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!worker?.id) return;
    setLoading(true);
    try {
      const res = await WorkerAPI.getReviews(worker.id, 1, 50);
      setReviews(res.data.data?.reviews ?? []);
      setTotal(res.data.data?.total ?? 0);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [worker?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Reviews</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        ListHeaderComponent={
          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={20} color={colors.star} />
                <Text style={styles.summaryValue}>{worker?.rating?.toFixed(1) ?? '—'}</Text>
              </View>
              <Text style={styles.summaryLabel}>Average rating</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{total || worker?.totalReviews || 0}</Text>
              <Text style={styles.summaryLabel}>Total reviews</Text>
            </Card>
          </View>
        }
        data={reviews}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="star-outline" title="No reviews yet" subtitle="Customer reviews will show up here after completed jobs." />
          ) : (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              {item.user?.avatar ? (
                <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={16} color={colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.reviewerName}>{item.user?.name ?? 'Customer'}</Text>
                <Text style={styles.reviewDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
              </View>
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={13} color={colors.star} />
                <Text style={styles.ratingText}>{item.rating}</Text>
              </View>
            </View>
            {item.comment ? <Text style={styles.comment}>{item.comment}</Text> : null}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  list: { padding: spacing.xxl, paddingTop: 0, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  summaryValue: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
  reviewCard: { gap: spacing.xs },
  reviewHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: { backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  reviewerName: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  reviewDate: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.warningLight, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999 },
  ratingText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textPrimary },
  comment: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
});
