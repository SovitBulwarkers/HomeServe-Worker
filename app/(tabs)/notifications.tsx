import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing } from '../../src/theme';
import { Card, EmptyState } from '../../src/components/ui';
import { NotificationAPI, AppNotification } from '../../src/api/endpoints';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  JOB_REQUEST: 'briefcase-outline',
  PAYMENT: 'wallet-outline',
  CHAT: 'chatbubble-ellipses-outline',
  SYSTEM: 'information-circle-outline',
  'booking.new_request': 'briefcase-outline',
  'booking.created': 'briefcase-outline',
  'booking.accepted': 'checkmark-circle-outline',
  'booking.started': 'construct-outline',
  'booking.completed': 'wallet-outline',
  'booking.cancelled': 'close-circle-outline',
  'booking.rejected': 'close-circle-outline',
  'worker.approved': 'ribbon-outline',
};

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await NotificationAPI.getAll(1, 30);
      setItems(data.data.notifications ?? []);
      setUnread(data.data.unreadCount ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openNotification = async (n: AppNotification) => {
    if (!n.isRead) {
      NotificationAPI.markRead(n.id).catch(() => undefined);
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, isRead: true } : i)));
    }
    const bookingId = (n.data as any)?.bookingId;
    if (bookingId) {
      router.push({ pathname: '/job/[id]', params: { id: bookingId } });
    }
  };

  const markAllRead = async () => {
    try {
      await NotificationAPI.markAllRead();
      setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
      setUnread(0);
    } catch {
      // Non-fatal.
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.heading}>Notifications</Text>
        {unread > 0 ? (
          <Pressable onPress={markAllRead}>
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="notifications-outline" title="You're all caught up" />}
          renderItem={({ item }) => (
            <Card onPress={() => openNotification(item)} style={[styles.card, !item.isRead && styles.cardUnread]}>
              <Ionicons name={ICONS[item.type] ?? 'notifications-outline'} size={22} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
                <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
              {!item.isRead ? <View style={styles.dot} /> : null}
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xxl, paddingTop: spacing.md },
  heading: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  markAll: { color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
  list: { padding: spacing.xxl, gap: spacing.sm, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'flex-start' },
  cardUnread: { backgroundColor: colors.primaryLight },
  title: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  body: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  time: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
});
