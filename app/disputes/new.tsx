import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../../src/theme';
import { Card, Input, statusLabel } from '../../src/components/ui';
import Button from '../../src/components/Button';
import { JobsAPI, DisputesAPI, Job, DisputeReason } from '../../src/api/endpoints';
import { DISPUTE_REASONS } from '../../src/constants/disputes';

type Step = 'PICK_JOB' | 'DETAILS';

export default function NewDispute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string }>();

  const [step, setStep] = useState<Step>('PICK_JOB');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [description, setDescription] = useState('');
  const [amountClaimed, setAmountClaimed] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const [completed, cancelled] = await Promise.all([
        JobsAPI.myJobs('COMPLETED'),
        JobsAPI.myJobs('CANCELLED'),
      ]);
      const all = [...(completed.data.data ?? []), ...(cancelled.data.data ?? [])];
      // Only jobs that actually have a payment can be disputed — matches
      // the backend rule (a dispute always attaches to a Payment record).
      const disputable = all
        .filter((j) => !!j.payment)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setJobs(disputable);

      if (params.bookingId) {
        const preset = disputable.find((j) => j.id === params.bookingId);
        if (preset) {
          setSelectedJob(preset);
          setStep('DETAILS');
        }
      }
    } catch {
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }, [params.bookingId]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const pickJob = (job: Job) => {
    setSelectedJob(job);
    setStep('DETAILS');
  };

  const submit = async () => {
    if (!selectedJob || !reason) return;
    if (description.trim().length < 10) {
      Alert.alert('Add more detail', 'Please describe the issue in at least a few words so our team has enough to review.');
      return;
    }
    const amount = amountClaimed.trim() ? Number(amountClaimed) : undefined;
    if (amountClaimed.trim() && (Number.isNaN(amount) || (amount as number) <= 0)) {
      Alert.alert('Invalid amount', 'Enter a valid amount, or leave it blank.');
      return;
    }
    // The backend accepts amountClaimed as-is with no server-side bound
    // (see DisputesController.raise / DisputesService — it's stored
    // verbatim, no min/max check against the job's actual paid amount).
    // Cap it here so a fat-fingered figure can't turn into a dispute
    // claiming e.g. 100x the job's value — the amount in question can
    // never reasonably exceed what the job was actually paid.
    const jobPaid = Number(selectedJob.finalAmount ?? selectedJob.total ?? 0);
    if (amount !== undefined && jobPaid > 0 && amount > jobPaid) {
      Alert.alert(
        'Amount too high',
        `This job's total was ₹${jobPaid.toFixed(0)}. Enter an amount up to that, or leave it blank.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      await DisputesAPI.raise({
        bookingId: selectedJob.id,
        reason,
        description: description.trim(),
        amountClaimed: amount,
      });
      Alert.alert('Dispute submitted', 'Our team will review it shortly.', [
        { text: 'OK', onPress: () => router.replace('/disputes') },
      ]);
    } catch (e: any) {
      Alert.alert('Could not submit', e?.response?.data?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const goBackStep = () => {
    if (step === 'DETAILS' && !params.bookingId) {
      setStep('PICK_JOB');
      setReason(null);
      setDescription('');
      setAmountClaimed('');
    } else {
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={goBackStep} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{step === 'PICK_JOB' ? 'Select a Job' : 'Raise Dispute'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {step === 'PICK_JOB' ? (
        <>
          <Text style={styles.helperText}>Which job is this dispute about?</Text>
          {loadingJobs ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
          ) : jobs.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="briefcase-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No eligible jobs</Text>
              <Text style={styles.emptySubtitle}>Only completed or cancelled jobs with a payment on file can be disputed.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              {jobs.map((job) => (
                <Card key={job.id} onPress={() => pickJob(job)} style={{ marginBottom: spacing.sm }}>
                  <View style={styles.jobRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.jobService} numberOfLines={1}>
                        {job.items?.map((i) => i.service?.name).filter(Boolean).join(', ') || 'Service'}
                      </Text>
                      <Text style={styles.jobMeta}>
                        #{job.bookingNumber} · {statusLabel(job.status)} · {new Date(job.scheduledDate).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.jobAmount}>₹{Number(job.finalAmount ?? job.total ?? 0).toFixed(0)}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                </Card>
              ))}
            </ScrollView>
          )}
        </>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {selectedJob ? (
              <Card style={styles.jobSummary}>
                <Ionicons name="briefcase" size={16} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={styles.jobSummaryTitle} numberOfLines={1}>
                    #{selectedJob.bookingNumber}
                  </Text>
                  <Text style={styles.jobSummaryMeta}>₹{Number(selectedJob.finalAmount ?? selectedJob.total ?? 0).toFixed(0)} · {new Date(selectedJob.scheduledDate).toLocaleDateString()}</Text>
                </View>
              </Card>
            ) : null}

            <Text style={styles.sectionLabel}>What's the issue?</Text>
            <View style={styles.reasonGrid}>
              {DISPUTE_REASONS.map((r) => (
                <Pressable
                  key={r.value}
                  onPress={() => setReason(r.value)}
                  style={[styles.reasonCard, reason === r.value && styles.reasonCardActive]}
                >
                  <Ionicons
                    name={r.icon as any}
                    size={18}
                    color={reason === r.value ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.reasonLabel, reason === r.value && styles.reasonLabelActive]}>{r.label}</Text>
                </Pressable>
              ))}
            </View>

            <Input
              label="Describe what happened"
              value={description}
              onChangeText={setDescription}
              placeholder="Give as much detail as you can — dates, amounts, what was agreed…"
              multiline
              style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: spacing.md }}
            />

            <Input
              label="Amount in question (optional)"
              value={amountClaimed}
              onChangeText={setAmountClaimed}
              placeholder="e.g. 250"
              keyboardType="decimal-pad"
              leftIcon="cash-outline"
            />
            {Number(selectedJob?.finalAmount ?? selectedJob?.total ?? 0) > 0 && (
              <Text style={styles.amountHint}>
                Up to ₹{Number(selectedJob?.finalAmount ?? selectedJob?.total ?? 0).toFixed(0)} — this job's total
              </Text>
            )}

            <View style={styles.noteBox}>
              <Ionicons name="information-circle-outline" size={16} color={colors.info} />
              <Text style={styles.noteText}>
                Our team reviews every dispute and may reach out for more evidence. You can withdraw it any time before it's resolved.
              </Text>
            </View>

            <Button
              title="Submit Dispute"
              onPress={submit}
              loading={submitting}
              disabled={!reason || description.trim().length < 10}
              style={{ marginTop: spacing.md }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.subtle },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  helperText: { fontSize: fontSize.sm, color: colors.textSecondary, paddingHorizontal: spacing.xxl, marginBottom: spacing.md },
  list: { padding: spacing.xxl, paddingTop: 0, flexGrow: 1 },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  jobService: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  jobMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  jobAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxxl },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.xs },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  jobSummary: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, marginBottom: spacing.lg, ...shadow.subtle },
  jobSummaryTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary },
  jobSummaryMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing.sm },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  reasonCard: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  reasonCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  reasonLabel: { flex: 1, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  reasonLabelActive: { color: colors.primaryDark },
  amountHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: -spacing.sm },
  noteBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.infoLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  noteText: { flex: 1, fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 17 },
});
