import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing } from '../../src/theme';
import { Card, RatingTag } from '../../src/components/ui';
import { useAuth } from '../../src/store/auth-context';

const MENU: { icon: keyof typeof Ionicons.glyphMap; label: string; route: string }[] = [
  { icon: 'person-outline', label: 'Edit profile', route: '/profile/edit' },
  { icon: 'construct-outline', label: 'Skills & services', route: '/profile/skills-services' },
  { icon: 'document-text-outline', label: 'Documents & verification', route: '/profile/documents' },
  { icon: 'card-outline', label: 'Bank details', route: '/profile/bank-details' },
  { icon: 'time-outline', label: 'Working hours', route: '/profile/working-hours' },
  { icon: 'help-circle-outline', label: 'Help & FAQ', route: '/support/faq' },
  { icon: 'chatbox-ellipses-outline', label: 'Support tickets', route: '/support/tickets' },
];

export default function Profile() {
  const router = useRouter();
  const { worker, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Profile</Text>

        <Card style={styles.profileCard}>
          {worker?.avatar ? (
            <Image source={{ uri: worker.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={28} color={colors.textMuted} />
            </View>
          )}
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.name}>{worker?.name ?? 'Worker'}</Text>
            <Text style={styles.phone}>{worker?.phone}</Text>
            <RatingTag rating={worker?.rating} reviewCount={worker?.totalReviews} />
          </View>
        </Card>

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{worker?.totalJobs ?? 0}</Text>
            <Text style={styles.statLabel}>Jobs done</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{worker?.experience ?? 0}y</Text>
            <Text style={styles.statLabel}>Experience</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{worker?.rating?.toFixed(1) ?? '—'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </Card>
        </View>

        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {MENU.map((item) => (
            <Card key={item.route} onPress={() => router.push(item.route as any)} style={styles.menuRow}>
              <Ionicons name={item.icon} size={20} color={colors.primary} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Card>
          ))}
        </View>

        <Card onPress={handleLogout} style={[styles.menuRow, { marginTop: spacing.lg }]}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={[styles.menuLabel, { color: colors.danger }]}>Log out</Text>
          <View style={{ flex: 1 }} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xxl, paddingBottom: spacing.xxxl * 2 },
  heading: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: spacing.lg },
  profileCard: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarPlaceholder: { backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  phone: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2, marginBottom: 4 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  statValue: { fontSize: fontSize.lg, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  menuLabel: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.textPrimary, flex: 1 },
});
