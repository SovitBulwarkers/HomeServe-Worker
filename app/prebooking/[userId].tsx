import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Socket } from 'socket.io-client';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { PreBookingChatAPI, ChatMessage } from '../../src/api/endpoints';
import { useAuth } from '../../src/store/auth-context';
import { getSocket } from '../../src/lib/socket';

/**
 * Mirrors app/job/chat.tsx's structure and reconnect-rejoin pattern, but
 * for the pre-booking thread with one specific customer (userId) — see
 * ChatService.getPreBookingMessages / ChatGateway's join-prebooking on the
 * backend. Reached either from the inbox at /prebooking, or directly from
 * a PREBOOKING_MESSAGE push notification.
 */
export default function PreBookingChat() {
  const { userId, userName } = useLocalSearchParams<{ userId: string; userName?: string }>();
  const router = useRouter();
  const { worker } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const listRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;

    (async () => {
      try {
        const msgRes = await PreBookingChatAPI.getMessages(userId, 1, 100);
        if (!mounted) return;
        setMessages(msgRes.data.data ?? []);
        PreBookingChatAPI.markRead(userId).catch(() => undefined);
      } catch {
        // Non-fatal — chat just starts empty.
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    (async () => {
      const socket = await getSocket('chat');
      if (!mounted) return;
      socketRef.current = socket;

      const onConnect = () => {
        setConnected(true);
        socket.emit('join-prebooking', { userId, workerId: worker?.id });
        socket.emit('mark-prebooking-read', { userId, workerId: worker?.id, senderType: 'USER' });
      };
      const onDisconnect = () => setConnected(false);
      const onNewMessage = (msg: ChatMessage & { userId?: string; workerId?: string }) => {
        if (msg.userId !== userId) return;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        if (msg.senderType === 'USER') {
          PreBookingChatAPI.markRead(userId).catch(() => undefined);
        }
      };

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('new-prebooking-message', onNewMessage);
      if (socket.connected) onConnect();

      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('new-prebooking-message', onNewMessage);
      };
    })();

    return () => {
      mounted = false;
    };
  }, [userId, worker?.id]);

  const send = () => {
    const body = text.trim();
    if (!body || !userId || !socketRef.current) return;
    setText('');
    setSending(true);
    // Backend broadcasts this back to us over 'new-prebooking-message' too
    // (we're in the room), so no need to append it locally here.
    socketRef.current.emit('send-prebooking-message', {
      userId,
      workerId: worker?.id,
      message: body,
      senderType: 'WORKER',
    });
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
      setSending(false);
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.headerName}>{userName || 'Customer'}</Text>
          <Text style={styles.headerSub}>
            Pre-booking inquiry · {connected ? 'Online' : 'Connecting…'}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 72 : 0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="chatbubbles-outline" size={36} color={colors.textMuted} />
                <Text style={styles.emptyText}>
                  No messages yet — this customer is asking about your availability or
                  services before booking.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isMe = item.senderType === 'WORKER';
              return (
                <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                    <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.message}</Text>
                  </View>
                </View>
              );
            }}
          />

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Reply to this inquiry..."
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
            />
            <Pressable
              onPress={send}
              disabled={!text.trim() || sending}
              style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
            >
              <Ionicons name="send" size={18} color={colors.white} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: colors.surface },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerName: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  headerSub: { fontSize: fontSize.xs, color: colors.textMuted },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.xxxl, paddingHorizontal: spacing.xl },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleThem: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: fontSize.md, color: colors.textPrimary },
  bubbleTextMe: { color: colors.white },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 100, backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.md, color: colors.textPrimary },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
