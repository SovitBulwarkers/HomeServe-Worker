import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius } from '../../src/theme';
import { useAuth } from '../../src/store/auth-context';

const ACCOUNT_MENU = [
  { icon: 'person-outline' as const, label: 'Edit Profile', route: '/profile/edit' },
  { icon: 'construct-outline' as const, label: 'Skills & Services Offered', route: '/profile/skills-services' },
  { icon: 'document-text-outline' as const, label: 'Documents & Verification', route: '/profile/documents' },
  { icon: 'card-outline' as const, label: 'Bank & Payout Details', route: '/profile/bank-details' },
];

const WORK_MENU = [
  { icon: 'time-outline' as const, label: 'Working Hours', route: '/profile/working-hours' },
  { icon: 'calendar-outline' as const, label: 'Availability Calendar', route: '/profile/availability' },
  { icon: 'star-outline' as const, label: 'Customer Reviews', route: '/profile/reviews' },
  { icon: 'shield-checkmark-outline' as const, label: 'Disputes & Claims', route: '/disputes' },
];

const SUPPORT_MENU = [
  { icon: 'help-circle-outline' as const, label: 'Help & FAQ', route: '/support/faq' },
  { icon: 'chatbox-ellipses-outline' as const, label: 'Support Tickets', route: '/support/tickets' },
];

export default function Profile() {
  const router = useRouter();
  const { worker, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Text style={styles.pageTitle}>Account Profile</Text>

        {/* Profile Card Header */}
        <View style={styles.profileHeaderCard}>
          <View style={styles.avatarWrap}>
            {worker?.avatar ? (
              <Image source={{ uri: worker.avatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={32} color={colors.primary} />
              </View>
            )}
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-sharp" size={12} color={colors.white} />
            </View>
          </View>

          <View style={styles.profileMeta}>
            <View style={styles.nameRow}>
              <Text style={styles.workerName}>{worker?.name ?? 'Partner'}</Text>
              <View style={styles.partnerChip}>
                <Text style={styles.partnerChipText}>PRO</Text>
              </View>
            </View>

            <Text style={styles.workerPhone}>{worker?.phone ?? ''}</Text>

            <View style={styles.ratingBox}>
              <Ionicons name="star" size={14} color={colors.star} />
              <Text style={styles.ratingVal}>{worker?.rating ? worker.rating.toFixed(1) : '5.0'}</Text>
              <Text style={styles.reviewCount}>({worker?.totalReviews ?? 0} reviews)</Text>
            </View>
          </View>
        </View>

        {/* Quick Stats Bar */}
        <View style={styles.statsStrip}>
          <View style={styles.statTile}>
            <Text style={styles.statNumber}>{worker?.totalJobs ?? 0}</Text>
            <Text style={styles.statTitle}>Jobs Done</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statTile}>
            <Text style={styles.statNumber}>{worker?.experience ?? 0} yrs</Text>
            <Text style={styles.statTitle}>Experience</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statTile}>
            <Text style={styles.statNumber}>{worker?.rating ? worker.rating.toFixed(1) : '5.0'} ★</Text>
            <Text style={styles.statTitle}>Rating</Text>
          </View>
        </View>

        {/* Menu Section 1: Account Settings */}
        <Text style={styles.menuGroupTitle}>Account Settings</Text>
        <View style={styles.menuGroup}>
          {ACCOUNT_MENU.map((item, i) => (
            <Pressable
              key={item.route}
              onPress={() => router.push(item.route as any)}
              style={[styles.menuItemRow, i < ACCOUNT_MENU.length - 1 && styles.menuItemBorder]}
            >
              <View style={styles.menuIconBox}>
                <Ionicons name={item.icon} size={18} color={colors.primary} />
              </View>
              <Text style={styles.menuItemText}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        {/* Menu Section 2: Work & Availability */}
        <Text style={styles.menuGroupTitle}>Work & Schedule</Text>
        <View style={styles.menuGroup}>
          {WORK_MENU.map((item, i) => (
            <Pressable
              key={item.route}
              onPress={() => router.push(item.route as any)}
              style={[styles.menuItemRow, i < WORK_MENU.length - 1 && styles.menuItemBorder]}
            >
              <View style={styles.menuIconBox}>
                <Ionicons name={item.icon} size={18} color={colors.primary} />
              </View>
              <Text style={styles.menuItemText}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        {/* Menu Section 3: Support */}
        <Text style={styles.menuGroupTitle}>Help & Support</Text>
        <View style={styles.menuGroup}>
          {SUPPORT_MENU.map((item, i) => (
            <Pressable
              key={item.route}
              onPress={() => router.push(item.route as any)}
              style={[styles.menuItemRow, i < SUPPORT_MENU.length - 1 && styles.menuItemBorder]}
            >
              <View style={styles.menuIconBox}>
                <Ionicons name={item.icon} size={18} color={colors.primary} />
              </View>
              <Text style={styles.menuItemText}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        {/* Logout Button */}
        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl * 2,
  },
  pageTitle: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  profileHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.success,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  profileMeta: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  workerName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  partnerChip: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  partnerChipText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
  },
  workerPhone: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  ratingVal: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  reviewCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  statTitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  menuGroupTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  menuGroup: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  menuIconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuItemText: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.dangerLight,
    marginTop: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  logoutText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.danger,
  },
});

