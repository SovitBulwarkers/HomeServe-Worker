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
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Socket } from 'socket.io-client';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { ChatAPI, ChatMessage, JobsAPI, Job } from '../../src/api/endpoints';
import { useAuth } from '../../src/store/auth-context';
import { getSocket } from '../../src/lib/socket';

export default function JobChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { worker } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const listRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      try {
        const [jobRes, msgRes] = await Promise.all([JobsAPI.getById(id), ChatAPI.getMessages(id, 1, 100)]);
        if (!mounted) return;
        const rawMsgs = msgRes.data.data ?? [];
        const sorted = rawMsgs
          .slice()
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setJob(jobRes.data.data);
        setMessages(sorted);
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

      // socket.io's `reconnection: true` (see src/lib/socket.ts) restores
      // the transport automatically, but room membership is server-side
      // session state tied to that specific connection — a reconnect (any
      // network blip, or the app coming back from the background) drops
      // us from `booking:{id}` without dropping the socket itself. Without
      // re-emitting join-booking here, we'd keep looking "connected" while
      // silently missing every new-message broadcast until this screen is
      // torn down and remounted.
      const onConnect = () => {
        setConnected(true);
        socket.emit('join-booking', { bookingId: id });
      };
      const onDisconnect = () => setConnected(false);
      const onNewMessage = (msg: ChatMessage) => {
        if (msg.bookingId !== id) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          const tempIdx = prev.findIndex((m) => m.id.startsWith('temp-') && m.message === msg.message);
          if (tempIdx !== -1) {
            const copy = [...prev];
            copy[tempIdx] = msg;
            return copy;
          }
          return [...prev, msg];
        });
      };

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('new-message', onNewMessage);
      if (socket.connected) onConnect();

      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('new-message', onNewMessage);
      };
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      return () => {};
    }, []),
  );

  const send = async () => {
    const body = text.trim();
    if (!body || !id) return;

    const tempId = `temp-${Date.now()}`;
    const tempMsg: ChatMessage = {
      id: tempId,
      bookingId: id,
      senderId: worker?.id || '',
      senderType: 'WORKER',
      message: body,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setText('');
    setSending(true);
    setMessages((prev) => [...prev, tempMsg]);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

    try {
      const res = await ChatAPI.sendMessage(id, body);
      const serverMsg = res.data?.data;
      if (serverMsg) {
        setMessages((prev) => {
          const hasReal = prev.some((m) => m.id === serverMsg.id);
          if (hasReal) {
            return prev.filter((m) => m.id !== tempId);
          }
          return prev.map((m) => (m.id === tempId ? serverMsg : m));
        });
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setText(body);
    } finally {
      setSending(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.headerName}>{job?.user?.name ?? 'Customer'}</Text>
          <Text style={styles.headerSub}>Job #{job?.bookingNumber ?? ''}</Text>
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
            renderItem={({ item }) => {
              const isMe = item.senderType === 'WORKER' || item.senderId === worker?.id;
              const formattedTime = item.createdAt
                ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';
              return (
                <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                    <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.message}</Text>
                    <View style={styles.bubbleMeta}>
                      <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{formattedTime}</Text>
                      {isMe && (
                        <Ionicons
                          name={item.isRead ? 'checkmark-done' : 'checkmark'}
                          size={14}
                          color={item.isRead ? '#90CAF9' : 'rgba(255,255,255,0.75)'}
                          style={{ marginLeft: 3 }}
                        />
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
          />

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
            />
            <Pressable onPress={send} disabled={!text.trim() || sending} style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}>
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
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleThem: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: fontSize.md, color: colors.textPrimary },
  bubbleTextMe: { color: colors.white },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  bubbleTime: { fontSize: 10, color: colors.textMuted },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.75)' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 100, backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.md, color: colors.textPrimary },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});