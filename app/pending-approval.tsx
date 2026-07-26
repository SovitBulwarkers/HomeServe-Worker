import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing } from '../src/theme';
import Button from '../src/components/Button';
import { useAuth } from '../src/store/auth-context';

export default function PendingApproval() {
  const router = useRouter();
  const { worker, refreshWorker, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshWorker();
    } finally {
      setRefreshing(false);
    }
  }, [refreshWorker]);

  const rejected = worker?.status === 'REJECTED';
  const suspended = worker?.status === 'SUSPENDED';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={[styles.iconWrap, rejected || suspended ? styles.iconWrapDanger : null]}>
          <Ionicons
            name={rejected || suspended ? 'close-circle-outline' : 'time-outline'}
            size={48}
            color={rejected || suspended ? colors.danger : colors.primary}
          />
        </View>

        {rejected ? (
          <>
            <Text style={styles.title}>Application not approved</Text>
            <Text style={styles.subtitle}>
              Your worker application wasn't approved this time. You can re-submit your documents or contact
              support if you think this is a mistake.
            </Text>
          </>
        ) : suspended ? (
          <>
            <Text style={styles.title}>Account suspended</Text>
            <Text style={styles.subtitle}>
              Your worker account is currently suspended. Please contact support for more information.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Application under review</Text>
            <Text style={styles.subtitle}>
              Thanks for signing up, {worker?.name ?? 'partner'}! Our team is verifying your details. This usually
              takes less than 24 hours — pull down to refresh and check your status.
            </Text>
          </>
        )}

        <Button title="Check status" onPress={onRefresh} loading={refreshing} style={{ marginTop: spacing.xxl }} />

        {rejected ? (
          <Button
            title="Re-upload documents"
            onPress={() => router.push('/profile/documents')}
            variant="outline"
            style={{ marginTop: spacing.md }}
          />
        ) : null}

        <Button
          title="Contact support"
          onPress={() => router.push('/support/tickets')}
          variant="ghost"
          style={{ marginTop: spacing.sm }}
        />
        <Button title="Log out" onPress={logout} variant="ghost" style={{ marginTop: spacing.xs }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  iconWrapDanger: { backgroundColor: colors.dangerLight },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
});