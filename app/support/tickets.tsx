import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
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
        <Text style={styles.headerTitle}>Support tickets</Text>
        <Pressable onPress={() => setCreateOpen(true)} style={styles.backBtn}>
          <Ionicons name="add" size={22} color={colors.textPrimary} />
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

      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New support ticket</Text>
            <Input label="Subject" value={subject} onChangeText={setSubject} placeholder="What's this about?" />
            <Input label="Description" value={description} onChangeText={setDescription} placeholder="Describe your issue" multiline />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button title="Cancel" variant="outline" onPress={() => setCreateOpen(false)} style={{ flex: 1 }} />
              <Button title="Submit" onPress={submit} loading={submitting} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  list: { padding: spacing.xxl, gap: spacing.sm, flexGrow: 1 },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  subject: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  description: { fontSize: fontSize.sm, color: colors.textSecondary },
  date: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xxl, gap: spacing.md },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
});