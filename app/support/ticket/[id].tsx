import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius } from '../../../src/theme';
import { StatusPill } from '../../../src/components/ui';
import { SupportAPI } from '../../../src/api/endpoints';

interface TicketMessage {
  id: string;
  senderType: 'USER' | 'WORKER' | 'ADMIN';
  message: string;
  createdAt: string;
}

interface TicketDetail {
  id: string;
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  messages?: TicketMessage[];
}

const ticketStatusTone = (s: TicketDetail['status']) =>
  s === 'OPEN' ? 'warning' : s === 'RESOLVED' ? 'success' : s === 'CLOSED' ? 'info' : 'info';

export default function TicketDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await SupportAPI.getTicket(id);
      setTicket(data.data ?? data);
    } catch {
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const isClosed = ticket?.status === 'CLOSED';

  const sendReply = async () => {
    if (!replyText.trim() || !ticket || isClosed) return;
    setSending(true);
    try {
      const { data } = await SupportAPI.reply(ticket.id, replyText.trim());
      const newMessage: TicketMessage = data.data ?? data;
      setTicket((t) => (t ? { ...t, messages: [...(t.messages ?? []), newMessage] } : t));
      setReplyText('');
    } catch {
      // Silently ignore — the message stays in the input so the worker can retry.
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{ticket?.subject ?? 'Ticket'}</Text>
        </View>
        {ticket ? <StatusPill label={ticket.status} tone={ticketStatusTone(ticket.status)} /> : null}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : !ticket ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Couldn't load this ticket.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 72 : 0}
        >
          <FlatList
            data={ticket.messages ?? []}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.messages}
            ListHeaderComponent={
              <View style={styles.originalCard}>
                <Text style={styles.originalText}>{ticket.description}</Text>
                <Text style={styles.originalDate}>{new Date(ticket.createdAt).toLocaleString()}</Text>
              </View>
            }
            ListEmptyComponent={
              <Text style={styles.noReplies}>No replies yet — our team will respond here soon.</Text>
            }
            renderItem={({ item }) => {
              const isMine = item.senderType === 'WORKER';
              return (
                <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : null]}>
                  <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : null]}>{item.message}</Text>
                    <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeMine : null]}>
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          {isClosed ? (
            <View style={styles.closedBanner}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
              <Text style={styles.closedText}>This ticket is closed. Raise a new one if you need more help.</Text>
            </View>
          ) : (
            <View style={styles.composer}>
              <TextInput
                style={styles.composerInput}
                placeholder="Type a message…"
                placeholderTextColor={colors.textMuted}
                value={replyText}
                onChangeText={setReplyText}
                multiline
                maxLength={1000}
              />
              <Pressable
                onPress={sendReply}
                disabled={sending || !replyText.trim()}
                style={[styles.sendBtn, (sending || !replyText.trim()) && styles.sendBtnDisabled]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="send" size={18} color={colors.white} />
                )}
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md },
  messages: { padding: spacing.xxl, paddingBottom: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  originalCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  originalText: { fontSize: fontSize.sm, color: colors.textPrimary, lineHeight: 20 },
  originalDate: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm },
  noReplies: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: fontSize.sm, color: colors.textPrimary, lineHeight: 19 },
  bubbleTextMine: { color: colors.white },
  bubbleTime: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.75)' },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  closedText: { fontSize: fontSize.xs, color: colors.textMuted, flex: 1 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.border },
});