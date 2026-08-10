import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../../src/theme';
import { Card, StatusPill, EmptyState, Input } from '../../src/components/ui';
import Button from '../../src/components/Button';
import { SupportAPI } from '../../src/api/endpoints';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
}

export default function Tickets() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await SupportAPI.myTickets();
      const list: any = data;
      setTickets(list.data?.tickets ?? list.data ?? []);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const submit = async () => {
    if (!subject.trim() || !description.trim()) {
      Alert.alert('Missing details', 'Please fill in both subject and description.');
      return;
    }
    setSubmitting(true);
    try {
      await SupportAPI.createTicket({ subject: subject.trim(), description: description.trim() });
      setCreateOpen(false);
      setSubject('');
      setDescription('');
      await load();
    } catch (e: any) {
      Alert.alert('Could not submit', e?.response?.data?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusTone = (s: Ticket['status']) => (s === 'OPEN' ? 'warning' : s === 'RESOLVED' ? 'success' : 'info');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Support Tickets</Text>
        <Pressable onPress={() => setCreateOpen(true)} style={[styles.backBtn, { backgroundColor: colors.primary }]}>
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="chatbox-ellipses-outline" title="No support tickets yet" subtitle="Tap + to raise a new request." />}
          renderItem={({ item }) => (
            <Card onPress={() => router.push({ pathname: '/support/ticket/[id]', params: { id: item.id } })}>
              <View style={styles.ticketTop}>
                <Text style={styles.subject}>{item.subject}</Text>
                <StatusPill label={item.status} tone={statusTone(item.status)} />
              </View>
              <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </Card>
          )}
        />
      )}

      {/* Upgraded Modern Support Ticket Modal */}
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.backdrop} onPress={() => setCreateOpen(false)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.handleBar} />
              
              <View style={styles.modalHeaderRow}>
                <View style={styles.headerIconWrap}>
                  <Ionicons name="help-buoy" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>New Support Ticket</Text>
                  <Text style={styles.modalSub}>Our support team responds within 2 hours</Text>
                </View>
                <Pressable onPress={() => setCreateOpen(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              <Input label="Subject" value={subject} onChangeText={setSubject} placeholder="What's this issue about?" />
              <Input label="Description" value={description} onChangeText={setDescription} placeholder="Describe your issue in detail" multiline />
              
              <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
                <Button title="Cancel" variant="outline" onPress={() => setCreateOpen(false)} style={{ flex: 1 }} />
                <Button title="Submit Ticket" onPress={submit} loading={submitting} style={{ flex: 1 }} />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.subtle },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  list: { padding: spacing.xxl, gap: spacing.sm, flexGrow: 1 },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  subject: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  description: { fontSize: fontSize.sm, color: colors.textSecondary },
  date: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  modalOverlay: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingHorizontal: spacing.xxl, paddingTop: spacing.md, paddingBottom: Platform.OS === 'ios' ? spacing.xxxl + 10 : spacing.xxl, gap: spacing.md, ...shadow.raised },
  handleBar: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.sm },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  headerIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  modalSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
});