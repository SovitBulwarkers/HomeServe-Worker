import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Alert, Linking, Image, Modal, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../../src/theme';
import { Card, StatusPill, IconBadge } from '../../src/components/ui';
import Button from '../../src/components/Button';
import ImagePickerModal from '../../src/components/ImagePickerModal';
import ImageViewerModal from '../../src/components/ImageViewerModal';
import { JobsAPI, Job, WorkerAPI, CustomerHistory } from '../../src/api/endpoints';

/**
 * Combines a booking's scheduledDate (a full ISO timestamp whose date part
 * is authoritative) with scheduledTime (a display string like "05:00 PM")
 * into one real Date object.
 *
 * Why this exists: this screen used to read `job.scheduledDate` on its own
 * for both the overdue check and the "Scheduled:" label. scheduledDate can
 * carry a stray, meaningless time-of-day (e.g. the moment the customer was
 * browsing the date picker) instead of the actual booked slot — so a job
 * booked for 5:00 PM could show "Scheduled: …, 3:09:24 PM" and immediately
 * flip to "Overdue" the moment that stray time passed, even hours before
 * the real 5 PM slot. Always deriving both from scheduledTime avoids that.
 */
function getScheduledDateTime(job: Pick<Job, 'scheduledDate' | 'scheduledTime'>): Date | null {
  if (!job.scheduledDate) return null;
  const base = new Date(job.scheduledDate);
  if (Number.isNaN(base.getTime())) return null;

  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((job.scheduledTime || '').trim());
  if (!match) return base; // No parseable time — fall back to the date as-is.

  let hours = parseInt(match[1], 10) % 12;
  const minutes = parseInt(match[2], 10);
  if (/pm/i.test(match[3])) hours += 12;

  const combined = new Date(base);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

function formatScheduled(job: Pick<Job, 'scheduledDate' | 'scheduledTime'>): string {
  const dt = getScheduledDateTime(job);
  if (!dt) return 'ASAP';
  return dt.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [uploadingStage, setUploadingStage] = useState<'before' | 'after' | null>(null);
  const [pickerModalStage, setPickerModalStage] = useState<'before' | 'after' | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [startModalVisible, setStartModalVisible] = useState(false);
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [missingAfterModalVisible, setMissingAfterModalVisible] = useState(false);
  const [lateModalVisible, setLateModalVisible] = useState(false);
  const [lateMinutes, setLateMinutes] = useState<number>(15);
  const [lateReason, setLateReason] = useState<string | null>(null);
  // Extra-charge request: work outside the fixed package (gas refill,
  // spare part, extra labour). Sent to the customer for approval —
  // nothing is charged from this screen.
  const [extraChargeModalVisible, setExtraChargeModalVisible] = useState(false);
  const [extraChargeLabel, setExtraChargeLabel] = useState('');
  const [extraChargeAmount, setExtraChargeAmount] = useState('');
  const [extraChargeReason, setExtraChargeReason] = useState('');
  const [requestingExtraCharge, setRequestingExtraCharge] = useState(false);
  // Shown right after a successful "Confirm Completed" — rating the
  // customer is optional, skippable, and never blocks the job from
  // actually being marked complete (that already happened by the time
  // this modal opens).
  const [rateCustomerModalVisible, setRateCustomerModalVisible] = useState(false);
  const [customerRating, setCustomerRating] = useState(0);
  const [customerRatingComment, setCustomerRatingComment] = useState('');
  const [submittingCustomerRating, setSubmittingCustomerRating] = useState(false);
  const [reportingLate, setReportingLate] = useState(false);
  const [startOtpDigits, setStartOtpDigits] = useState(['', '', '', '']);
  const [startError, setStartError] = useState('');
  const otpInputs = useRef<Array<TextInput | null>>([]);
  // Your own history with this customer — only fetched/shown while the
  // request is still PENDING (i.e. before you've decided whether to
  // accept), same spirit as the warning the customer app shows before
  // rebooking a worker. Never blocks accepting, just informs.
  const [customerHistory, setCustomerHistory] = useState<CustomerHistory | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await JobsAPI.getById(id);
      setJob(data.data);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 403 || status === 404) {
        Alert.alert(
          'Job no longer available',
          'This request has already been taken by another worker or is no longer open.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Best-effort: no prior bookings with this customer just means no
    // history to show, not an error worth surfacing.
    if (job?.status === 'PENDING' && job.user?.id) {
      JobsAPI.getHistoryWithCustomer(job.user.id)
        .then((res) => setCustomerHistory((res.data as any)?.data ?? null))
        .catch(() => setCustomerHistory(null));
    }
  }, [job?.status, job?.user?.id]);

  const runAction = async (fn: () => Promise<any>, successMsg?: string) => {
    setActing(true);
    try {
      await fn();
      if (successMsg) Alert.alert('Success', successMsg);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Action failed. Please try again.');
    } finally {
      setActing(false);
    }
  };

  const handleOtpDigitChange = (val: string, index: number) => {
    const text = val.slice(-1);
    const newDigits = [...startOtpDigits];
    newDigits[index] = text;
    setStartOtpDigits(newDigits);
    setStartError('');

    if (text && index < 3) {
      otpInputs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !startOtpDigits[index] && index > 0) {
      otpInputs.current[index - 1]?.focus();
    }
  };

  const submitStartOtp = () => {
    const code = startOtpDigits.join('');
    if (code.length < 4) {
      setStartError('Please enter all 4 digits');
      return;
    }
    setActing(true);
    JobsAPI.start(job!.id, code)
      .then(() => {
        setStartModalVisible(false);
        setStartOtpDigits(['', '', '', '']);
        setStartError('');
        load();
      })
      .catch((e: any) => {
        setStartError(e?.response?.data?.message || 'Incorrect OTP code. Ask customer for start OTP.');
      })
      .finally(() => setActing(false));
  };

  const handleImagePicked = async (uri: string, stage: 'before' | 'after') => {
    if (!job) return;
    setUploadingStage(stage);
    try {
      await JobsAPI.addWorkProof(job.id, stage, [uri]);
      await load();
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.response?.data?.message || 'Failed to upload photo.');
    } finally {
      setUploadingStage(null);
    }
  };

  const handleMarkCompletedPress = () => {
    if (!job) return;
    const afterCount = (job.proofAfterPhotos ?? []).length;
    if (afterCount === 0) {
      setMissingAfterModalVisible(true);
    } else {
      setCompleteModalVisible(true);
    }
  };

  const callCustomer = () => {
    if (job?.user?.phone) Linking.openURL(`tel:${job.user.phone}`);
  };

  const LATE_REASONS: { id: string; label: string }[] = [
    { id: 'TRAFFIC', label: 'Traffic' },
    { id: 'PREVIOUS_JOB_DELAYED', label: 'Previous job delayed' },
    { id: 'VEHICLE_ISSUE', label: 'Vehicle issue' },
    { id: 'EMERGENCY', label: 'Emergency' },
  ];

  const submitRunningLate = async () => {
    if (!job || !lateReason) return;
    setReportingLate(true);
    try {
      await JobsAPI.reportRunningLate(job.id, lateMinutes, lateReason);
      setLateModalVisible(false);
      setLateReason(null);
      Alert.alert('Customer notified', "They've been told you're running late.");
      load();
    } catch (e: any) {
      Alert.alert('Could not send', e?.response?.data?.message || 'Please try again.');
    } finally {
      setReportingLate(false);
    }
  };

  const openChat = () => {
    if (job) router.push({ pathname: '/job/chat', params: { id: job.id } });
  };

  if (loading || !job) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxxl }} />
      </SafeAreaView>
    );
  }

  const scheduledDateTime = getScheduledDateTime(job);
  const isOverdue =
    ['PENDING', 'ACCEPTED'].includes(job.status) &&
    scheduledDateTime !== null &&
    scheduledDateTime.getTime() < Date.now();

  const isAccepted = job.status === 'ACCEPTED';
  const serviceItem = job.items?.[0];
  const serviceName = serviceItem?.service?.name ?? 'Service Request';
  const totalAmount = job.finalAmount ?? job.totalAmount ?? job.total ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Job #{job.bookingNumber}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isOverdue ? (
          <View style={styles.overdueBanner}>
            <Ionicons name="time-outline" size={18} color={colors.danger} />
            <Text style={styles.overdueBannerText}>
              Overdue — this job was scheduled for {formatScheduled(job)}. Please complete or contact customer.
            </Text>
          </View>
        ) : null}

        {job.preferredWorkerId ? (
          <View style={styles.directRequestBanner}>
            <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.directRequestBannerText}>
              This customer requested you directly for this job.
            </Text>
          </View>
        ) : null}

        {job.reassignCount ? (
          <View style={styles.reassignBanner}>
            <Ionicons name="refresh-outline" size={18} color="#1D4ED8" />
            <Text style={styles.reassignBannerText}>
              Reassigned {job.reassignCount > 1 ? `${job.reassignCount} times` : 'once'} — a previous professional didn't show up. The customer may already be waiting.
            </Text>
          </View>
        ) : null}

        {job.status === 'PENDING' && customerHistory?.hasComplaint ? (
          <View style={styles.customerHistoryBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={styles.customerHistoryBannerTitle}>
                This customer rated you low before
              </Text>
              <Text style={styles.customerHistoryBannerText}>
                {customerHistory.complaints[0].rating}★ ·{" "}
                {customerHistory.complaints[0].comment}
              </Text>
            </View>
          </View>
        ) : null}

        <Card>
          <View style={styles.statusRow}>
            <StatusPill label={job.status} tone={job.status === 'COMPLETED' ? 'success' : job.status === 'CANCELLED' ? 'danger' : 'info'} />
            <Text style={styles.amount}>₹{totalAmount}</Text>
          </View>

          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>
            {serviceName}
          </Text>

          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 }}>
            Scheduled: {formatScheduled(job)}
          </Text>
        </Card>

        {/* What's covered at the fixed price vs. what needs an
            extra-charge request — real, admin-configured per service.
            Only renders when an admin has actually filled these in;
            no fabricated checklist. */}
        {(serviceItem?.service?.includedItems?.length || serviceItem?.service?.excludedItems?.length) ? (
          <Card>
            <Text style={styles.sectionTitle}>What's covered at ₹{totalAmount}</Text>
            {serviceItem?.service?.includedItems?.length ? (
              <View style={{ marginTop: spacing.xs }}>
                {serviceItem.service.includedItems.map((item, i) => (
                  <View key={`inc-${i}`} style={styles.priceItemRow}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.success ?? '#16a34a'} />
                    <Text style={styles.priceItemText}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {serviceItem?.service?.excludedItems?.length ? (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={styles.priceItemSubheading}>Needs an extra-charge request:</Text>
                {serviceItem.service.excludedItems.map((item, i) => (
                  <View key={`exc-${i}`} style={styles.priceItemRow}>
                    <Text style={styles.priceItemDot}>•</Text>
                    <Text style={styles.priceItemText}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Live Customer & Job Site Route Card */}
        <Card>
          <Text style={styles.sectionTitle}>Customer & Route</Text>
          <View style={styles.customerRow}>
            {job.user?.avatar ? (
              <Image source={{ uri: job.user.avatar }} style={styles.customerAvatar} />
            ) : (
              <IconBadge name="person" size={20} badgeSize={44} />
            )}
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.customerName}>{job.user?.name ?? 'Customer'}</Text>
              {job.user?.phone ? (
                <Text style={styles.customerPhone}>{job.user.phone}</Text>
              ) : (
                <Text style={styles.privacyNote}>Phone shared after accept</Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {job.user?.phone ? (
                <Pressable onPress={callCustomer} style={styles.callBtn}>
                  <Ionicons name="call" size={18} color={colors.white} />
                </Pressable>
              ) : null}
              <Pressable onPress={openChat} style={[styles.callBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="chatbubble-ellipses" size={18} color={colors.white} />
              </Pressable>
            </View>
          </View>

          {job.address?.fullAddress ? (
            <>
              <View style={styles.divider} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="location" size={16} color={colors.primary} />
                <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary, flex: 1 }}>
                  {job.address.fullAddress}
                </Text>
              </View>
              {job.address.landmark ? (
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4, marginLeft: 20 }}>
                  Landmark: {job.address.landmark}
                </Text>
              ) : null}
              {['ACCEPTED', 'IN_PROGRESS'].includes(job.status) ? (
                <Button
                  title="Navigate to Job"
                  variant="outline"
                  icon={<Ionicons name="navigate" size={16} color={colors.primary} />}
                  onPress={() => router.push({ pathname: '/job/track', params: { id: job.id } })}
                  style={{ marginTop: spacing.md }}
                />
              ) : null}
            </>
          ) : null}
        </Card>

        {/* Work Proof Photo Section */}
        {['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(job.status) ? (
          <Card style={{ gap: spacing.md }}>
            <View style={styles.proofHeader}>
              <Text style={styles.sectionTitle}>Work Proof Photos</Text>
            </View>

            {/* Before Photos */}
            <View style={{ gap: spacing.xs }}>
              <View style={styles.proofHeader}>
                <Text style={styles.proofStageTitle}>📷 Before Work Photos</Text>
                <Text style={styles.proofStageCount}>
                  {(job.proofBeforePhotos ?? []).length} photo{(job.proofBeforePhotos ?? []).length === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.photoRow}>
                {(job.proofBeforePhotos ?? []).map((url, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setPreviewImage({ url, title: `Before Work Photo ${i + 1}` })}
                  >
                    <Image source={{ uri: url }} style={styles.photoThumb} />
                  </Pressable>
                ))}
                {['ACCEPTED', 'IN_PROGRESS'].includes(job.status) ? (
                  <Pressable
                    style={({ pressed }) => [styles.addPhotoBtn, pressed && styles.addPhotoBtnActive]}
                    disabled={uploadingStage === 'before'}
                    onPress={() => setPickerModalStage('before')}
                  >
                    {uploadingStage === 'before' ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="camera" size={24} color={colors.primary} />
                        <Text style={styles.addPhotoText}>+ Before</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.divider} />

            {/* After Photos */}
            <View style={{ gap: spacing.xs }}>
              <View style={styles.proofHeader}>
                <Text style={styles.proofStageTitle}>📸 After Work Photos</Text>
                <Text style={styles.proofStageCount}>
                  {(job.proofAfterPhotos ?? []).length} photo{(job.proofAfterPhotos ?? []).length === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.photoRow}>
                {(job.proofAfterPhotos ?? []).map((url, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setPreviewImage({ url, title: `After Work Photo ${i + 1}` })}
                  >
                    <Image source={{ uri: url }} style={styles.photoThumb} />
                  </Pressable>
                ))}

                {job.status === 'IN_PROGRESS' ? (
                  <Pressable
                    style={({ pressed }) => [styles.addPhotoBtn, pressed && styles.addPhotoBtnActive]}
                    disabled={uploadingStage === 'after'}
                    onPress={() => setPickerModalStage('after')}
                  >
                    {uploadingStage === 'after' ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="camera" size={24} color={colors.primary} />
                        <Text style={styles.addPhotoText}>+ After</Text>
                      </>
                    )}
                  </Pressable>
                ) : isAccepted ? (
                  <View style={styles.lockedPhotoBox}>
                    <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
                    <Text style={styles.lockedPhotoText}>
                      Unlocks after OTP start
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Card>
        ) : null}

        {/* Job Breakdown Card */}
        <Card>
          <Text style={styles.sectionTitle}>Requested Services</Text>
          {(job.items ?? []).map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.service?.name ?? 'Service item'}</Text>
              <Text style={styles.itemQty}>x{item.quantity}</Text>
            </View>
          ))}
        </Card>

        {/* Extra-charge request history — worker could otherwise never see
            whether the customer approved/declined what they asked for. */}
        {!!job.extraCharges?.length && (
          <Card>
            <Text style={styles.sectionTitle}>Your Extra-Charge Requests</Text>
            {job.extraCharges.map((c) => (
              <View key={c.id} style={styles.itemRow}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={styles.itemName}>{c.label}</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                    {c.status === 'PENDING'
                      ? 'Waiting on customer'
                      : c.status === 'APPROVED'
                      ? 'Approved — added to bill'
                      : 'Declined by customer'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      fontWeight: fontWeight.bold,
                      color:
                        c.status === 'APPROVED'
                          ? colors.success ?? '#16a34a'
                          : c.status === 'REJECTED'
                          ? colors.textMuted
                          : colors.warning,
                      textDecorationLine: c.status === 'REJECTED' ? 'line-through' : 'none',
                    }}
                  >
                    ₹{c.amount.toFixed(0)}
                  </Text>
                  <StatusPill
                    label={c.status}
                    tone={c.status === 'APPROVED' ? 'success' : c.status === 'REJECTED' ? 'danger' : 'warning'}
                  />
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* Payment Summary */}
        {job.payment ? (
          <Card>
            <Text style={styles.sectionTitle}>Payment</Text>
            <View style={styles.itemRow}>
              <Text style={styles.metaText}>Status</Text>
              <Text style={{ fontWeight: fontWeight.bold, color: job.payment.status === 'PAID' ? colors.success : colors.warning }}>
                {job.payment.status}
              </Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.metaText}>Method</Text>
              <Text style={styles.itemQty}>{job.payment.method}</Text>
            </View>
          </Card>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {job.status === 'IN_PROGRESS' ? (
          <Pressable
            style={styles.lateLinkBtn}
            onPress={() => {
              setExtraChargeLabel('');
              setExtraChargeAmount('');
              setExtraChargeReason('');
              setExtraChargeModalVisible(true);
            }}
          >
            <Ionicons name="construct-outline" size={16} color={colors.warning} />
            <Text style={styles.lateLinkText}>
              Found extra work? Request approval for a charge
            </Text>
          </Pressable>
        ) : null}
        {['ACCEPTED', 'IN_PROGRESS'].includes(job.status) ? (
          <Pressable
            style={styles.lateLinkBtn}
            onPress={() => {
              setLateMinutes(15);
              setLateReason(null);
              setLateModalVisible(true);
            }}
          >
            <Ionicons name="time-outline" size={16} color={colors.warning} />
            <Text style={styles.lateLinkText}>
              {job.runningLateMinutes
                ? `Customer notified: ~${job.runningLateMinutes} min late — update`
                : "Running late? Let the customer know"}
            </Text>
          </Pressable>
        ) : null}
        {job.status === 'PENDING' ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              title="Decline"
              variant="outline"
              style={{ flex: 1 }}
              disabled={acting}
              onPress={() =>
                Alert.alert('Decline job?', 'This request will be offered to another worker.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Decline', style: 'destructive', onPress: () => runAction(() => JobsAPI.reject(job.id)) },
                ])
              }
            />
            <Button
              title="Accept job"
              style={{ flex: 1 }}
              loading={acting}
              onPress={() => runAction(() => JobsAPI.accept(job.id))}
            />
          </View>
        ) : job.status === 'ACCEPTED' ? (
          <Button title="Start job" loading={acting} onPress={() => { setStartOtpDigits(['', '', '', '']); setStartError(''); setStartModalVisible(true); }} />
        ) : job.status === 'IN_PROGRESS' ? (
          <Button
            title="Mark as completed"
            loading={acting}
            onPress={handleMarkCompletedPress}
          />
        ) : null}
      </View>

      {/* Running Late Modal */}
      {lateModalVisible && (
      <Modal
        visible={lateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLateModalVisible(false)}
      >
        <Pressable style={styles.centerModalOverlay} onPress={() => setLateModalVisible(false)}>
          <Pressable style={styles.centerModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.simpleModalTitle}>Running Late</Text>
            <Text style={styles.simpleModalSub}>
              The customer will see: "Your professional is running about {lateMinutes} minutes late."
            </Text>

            <View style={styles.lateMinutesRow}>
              {[10, 15, 20, 30, 45].map((m) => (
                <Pressable
                  key={m}
                  style={[styles.lateMinuteChip, lateMinutes === m && styles.lateMinuteChipSel]}
                  onPress={() => setLateMinutes(m)}
                >
                  <Text style={[styles.lateMinuteChipText, lateMinutes === m && styles.lateMinuteChipTextSel]}>
                    {m}m
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.lateReasonWrap}>
              {LATE_REASONS.map((r) => (
                <Pressable
                  key={r.id}
                  style={[styles.lateReasonRow, lateReason === r.id && styles.lateReasonRowSel]}
                  onPress={() => setLateReason(r.id)}
                >
                  <Ionicons
                    name={lateReason === r.id ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={lateReason === r.id ? colors.primary : colors.textMuted}
                  />
                  <Text style={styles.lateReasonText}>{r.label}</Text>
                </Pressable>
              ))}
            </View>

            <Button
              title="Notify Customer"
              loading={reportingLate}
              disabled={!lateReason}
              onPress={submitRunningLate}
              style={{ width: '100%', height: 50, borderRadius: radius.xl, marginTop: spacing.md }}
            />
            <Pressable style={styles.simpleCancelBtn} onPress={() => setLateModalVisible(false)}>
              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.semibold }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      )}

      {/* Image Upload Source Selector Modal */}
      <ImagePickerModal
        visible={!!pickerModalStage}
        onClose={() => setPickerModalStage(null)}
        title={`Upload ${pickerModalStage === 'before' ? 'Before' : 'After'} Photo`}
        subtitle={`Use camera to capture ${pickerModalStage === 'before' ? 'a live before' : 'a live after'} work proof photo`}
        onImagePicked={(uri) => {
          if (pickerModalStage) {
            handleImagePicked(uri, pickerModalStage);
          }
        }}
      />

      {/* Fullscreen Photo Preview Modal */}
      <ImageViewerModal
        visible={!!previewImage}
        imageUrl={previewImage?.url ?? ''}
        title={previewImage?.title ?? 'Work Proof Photo'}
        onClose={() => setPreviewImage(null)}
      />

      {/* Start Job OTP Modal */}
      {startModalVisible && (
      <Modal
        visible={startModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStartModalVisible(false)}
        onShow={() => {
          setTimeout(() => {
            otpInputs.current[0]?.focus();
          }, 100);
        }}
      >
        <Pressable
          style={styles.centerModalOverlay}
          onPress={() => {
            setStartModalVisible(false);
            setStartOtpDigits(['', '', '', '']);
            setStartError('');
          }}
        >
          <Pressable style={styles.centerModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handleBar} />

            <View style={styles.modalIconWrap}>
              <Ionicons name="key" size={28} color={colors.primary} />
            </View>
            <Text style={styles.modalTitle}>Enter Start OTP</Text>
            <Text style={styles.modalSubtitle}>
              Ask customer for the 4-digit start OTP shown on their screen to begin work.
            </Text>

            <View style={styles.otpBoxesRow}>
              {startOtpDigits.map((digit, idx) => (
                <TextInput
                  key={idx}
                  ref={(r) => {
                    otpInputs.current[idx] = r;
                  }}
                  value={digit}
                  onChangeText={(v) => handleOtpDigitChange(v, idx)}
                  onKeyPress={(e) => handleOtpKeyPress(e, idx)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                  style={[
                    styles.digitBoxInput,
                    digit ? styles.digitBoxFilled : null,
                    startError ? styles.digitBoxError : null,
                  ]}
                />
              ))}
            </View>

            {startError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.modalErrorText}>{startError}</Text>
              </View>
            ) : null}

            <Button
              title="Verify & Start Work"
              loading={acting}
              onPress={submitStartOtp}
              style={{ marginTop: spacing.xl, width: '100%' }}
            />

            <Pressable
              style={styles.modalCancelBtn}
              onPress={() => {
                setStartModalVisible(false);
                setStartOtpDigits(['', '', '', '']);
                setStartError('');
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      )}

      {/* Missing After Photo Modal Prompt */}
      {missingAfterModalVisible && (
      <Modal
        visible={missingAfterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMissingAfterModalVisible(false)}
      >
        <Pressable style={styles.centerModalOverlay} onPress={() => setMissingAfterModalVisible(false)}>
          <Pressable style={styles.centerModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.completeIconCircle, { backgroundColor: colors.warningLight }]}>
              <Ionicons name="camera-outline" size={34} color={colors.warning} />
            </View>

            <Text style={styles.simpleModalTitle}>Upload After Photo</Text>
            <Text style={styles.simpleModalSub}>
              Please capture at least 1 "After Work Photo" to prove work completion before completing this job.
            </Text>

            <Button
              title="Take After Photo Now"
              icon={<Ionicons name="camera" size={18} color={colors.white} />}
              onPress={() => {
                setMissingAfterModalVisible(false);
                // This button lives inside a native <Modal> (see the note
                // in ImagePickerModal.tsx: launching a camera-adjacent
                // overlay in the same tick as a native Modal's teardown
                // races the OS and can silently no-op the camera intent
                // on Android). Give the Modal's dismiss a beat before
                // mounting the plain-overlay picker.
                setTimeout(() => setPickerModalStage('after'), 300);
              }}
              style={{ width: '100%', height: 50, borderRadius: radius.xl, marginBottom: spacing.sm }}
            />

            <Pressable
              style={styles.simpleCancelBtn}
              onPress={() => {
                setMissingAfterModalVisible(false);
                setCompleteModalVisible(true);
              }}
            >
              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.semibold }}>
                Skip & Complete Anyway
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      )}

      {/* Clean & Simple Complete Job Modal */}
      {completeModalVisible && (
      <Modal
        visible={completeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCompleteModalVisible(false)}
      >
        <Pressable style={styles.centerModalOverlay} onPress={() => setCompleteModalVisible(false)}>
          <Pressable style={styles.centerModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.completeIconCircle}>
              <Ionicons name="checkmark-circle" size={38} color={colors.success} />
            </View>

            <Text style={styles.simpleModalTitle}>Complete Job?</Text>
            <Text style={styles.simpleModalSub}>
              Confirm that you have finished the work to customer satisfaction.
            </Text>

            <View style={styles.simplePayoutBadge}>
              <Text style={styles.simplePayoutLabel}>TOTAL PAYOUT</Text>
              <Text style={styles.simplePayoutAmount}>₹{totalAmount}</Text>
            </View>

            <Button
              title="Confirm Completed"
              loading={acting}
              onPress={() => {
                setCompleteModalVisible(false);
                runAction(() => JobsAPI.complete(job.id), 'Job marked complete. Great job!').then(() => {
                  // Optional, skippable — the job is already complete by
                  // this point regardless of whether the worker rates the
                  // customer or dismisses this.
                  setCustomerRating(0);
                  setCustomerRatingComment('');
                  setRateCustomerModalVisible(true);
                });
              }}
              style={styles.confirmBtn}
            />

            <Pressable style={styles.simpleCancelBtn} onPress={() => setCompleteModalVisible(false)}>
              <Text style={styles.simpleCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      )}

      {/* Extra Charge Request Modal — work outside the fixed package */}
      {extraChargeModalVisible && (
      <Modal
        visible={extraChargeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExtraChargeModalVisible(false)}
      >
        <Pressable style={styles.centerModalOverlay} onPress={() => setExtraChargeModalVisible(false)}>
          <Pressable style={styles.centerModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.completeIconCircle}>
              <Ionicons name="construct" size={32} color={colors.warning} />
            </View>
            <Text style={styles.simpleModalTitle}>Request Extra Charge</Text>
            <Text style={styles.simpleModalSub}>
              Sent to the customer for approval. Nothing is charged until they approve it.
            </Text>

            <TextInput
              style={styles.extraChargeInput}
              placeholder="What's the extra work? e.g. Gas refill"
              placeholderTextColor={colors.textMuted}
              value={extraChargeLabel}
              onChangeText={setExtraChargeLabel}
            />
            <TextInput
              style={styles.extraChargeInput}
              placeholder="Amount (₹)"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              value={extraChargeAmount}
              onChangeText={setExtraChargeAmount}
            />
            <TextInput
              style={[styles.extraChargeInput, { height: 72, textAlignVertical: 'top' }]}
              placeholder="Details for the customer (optional)"
              placeholderTextColor={colors.textMuted}
              multiline
              value={extraChargeReason}
              onChangeText={setExtraChargeReason}
            />

            <Button
              title="Send for Approval"
              loading={requestingExtraCharge}
              disabled={!extraChargeLabel.trim() || !Number(extraChargeAmount)}
              onPress={async () => {
                if (!job) return;
                setRequestingExtraCharge(true);
                try {
                  await JobsAPI.requestExtraCharge(job.id, {
                    label: extraChargeLabel.trim(),
                    amount: Number(extraChargeAmount),
                    reason: extraChargeReason.trim() || undefined,
                  });
                  setExtraChargeModalVisible(false);
                  Alert.alert('Sent', "We've asked the customer to approve this charge.");
                } catch (e: any) {
                  Alert.alert('Error', e?.response?.data?.message || 'Could not send the request. Please try again.');
                } finally {
                  setRequestingExtraCharge(false);
                }
              }}
              style={styles.confirmBtn}
            />
            <Pressable style={styles.simpleCancelBtn} onPress={() => setExtraChargeModalVisible(false)}>
              <Text style={styles.simpleCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      )}

      {/* Rate Customer Modal — shown right after a job is marked complete.
          Fully optional/skippable; the job is already complete either way.
          Internal-only signal, never shown on the customer's profile. */}
      {rateCustomerModalVisible && (
      <Modal
        visible={rateCustomerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRateCustomerModalVisible(false)}
      >
        <Pressable style={styles.centerModalOverlay} onPress={() => setRateCustomerModalVisible(false)}>
          <Pressable style={styles.centerModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.completeIconCircle}>
              <Ionicons name="star" size={32} color={colors.warning} />
            </View>
            <Text style={styles.simpleModalTitle}>Rate this customer</Text>
            <Text style={styles.simpleModalSub}>
              Punctuality, site access, clarity — this helps our team, not the customer's public profile.
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: spacing.md }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setCustomerRating(n)}>
                  <Ionicons
                    name={n <= customerRating ? 'star' : 'star-outline'}
                    size={32}
                    color={colors.warning}
                  />
                </Pressable>
              ))}
            </View>

            <TextInput
              style={[styles.extraChargeInput, { height: 64, textAlignVertical: 'top' }]}
              placeholder="Optional comment"
              placeholderTextColor={colors.textMuted}
              multiline
              value={customerRatingComment}
              onChangeText={setCustomerRatingComment}
            />

            <Button
              title="Submit Rating"
              loading={submittingCustomerRating}
              disabled={customerRating === 0}
              onPress={async () => {
                if (!job) return;
                setSubmittingCustomerRating(true);
                try {
                  await WorkerAPI.rateCustomer(job.id, customerRating, customerRatingComment.trim() || undefined);
                  setRateCustomerModalVisible(false);
                } catch (e: any) {
                  Alert.alert('Error', e?.response?.data?.message || 'Could not submit rating.');
                } finally {
                  setSubmittingCustomerRating(false);
                }
              }}
              style={styles.confirmBtn}
            />
            <Pressable style={styles.simpleCancelBtn} onPress={() => setRateCustomerModalVisible(false)}>
              <Text style={styles.simpleCancelText}>Skip</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxxl + 10 : spacing.xxl,
    alignItems: 'center',
    ...shadow.raised,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: 2, textAlign: 'center' },
  modalSubtitle: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md, lineHeight: 18 },
  otpBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
    width: '100%',
  },
  digitBoxInput: {
    width: 58,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    ...shadow.subtle,
  },
  digitBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  digitBoxError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerLight,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    backgroundColor: colors.dangerLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  modalErrorText: { color: colors.danger, fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  modalCancelBtn: { marginTop: spacing.md, paddingVertical: spacing.xs },
  modalCancelText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  
  /* Simple Centered Complete Job Modal Styles */
  centerModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  centerModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.xxl,
    alignItems: 'center',
    ...shadow.raised,
  },
  completeIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  simpleModalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  simpleModalSub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  extraChargeInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  simplePayoutBadge: {
    width: '100%',
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  simplePayoutLabel: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: colors.primaryDark,
    letterSpacing: 0.5,
  },
  simplePayoutAmount: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.primaryDark,
    marginTop: 2,
  },
  confirmBtn: {
    width: '100%',
    height: 50,
    borderRadius: radius.xl,
    backgroundColor: colors.success,
  },
  simpleCancelBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  simpleCancelText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  content: { padding: spacing.xxl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxxl },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  amount: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.primary },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  overdueBannerText: { flex: 1, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.danger },
  customerHistoryBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  customerHistoryBannerTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#92400E' },
  customerHistoryBannerText: { fontSize: fontSize.xs, color: '#92400E', marginTop: 2 },
  directRequestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight ?? '#EEF2FF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  directRequestBannerText: { flex: 1, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  reassignBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#EFF6FF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  reassignBannerText: { flex: 1, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: '#1D4ED8' },
  priceItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  priceItemDot: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 18 },
  priceItemText: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
  priceItemSubheading: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textPrimary },
  proofHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  proofStageTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  proofStageCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  photoThumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  addPhotoBtn: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  addPhotoBtnActive: {
    opacity: 0.6,
  },
  addPhotoText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    marginTop: 2,
  },
  lockedPhotoBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  lockedPhotoText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  itemName: { fontSize: fontSize.md, color: colors.textPrimary, flex: 1 },
  itemQty: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.semibold },
  metaText: { fontSize: fontSize.sm, color: colors.textSecondary, flex: 1 },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.sm },
  customerRow: { flexDirection: 'row', alignItems: 'center' },
  customerAvatar: { width: 44, height: 44, borderRadius: 22 },
  customerName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  customerPhone: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  privacyNote: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: 'italic' },
  footer: { padding: spacing.xxl, borderTopWidth: 1, borderTopColor: colors.borderLight, backgroundColor: colors.surface, gap: spacing.sm },
  lateLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  lateLinkText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.warning,
  },
  lateMinutesRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  lateMinuteChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  lateMinuteChipSel: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  lateMinuteChipText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  lateMinuteChipTextSel: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  lateReasonWrap: {
    width: '100%',
    gap: spacing.xs,
  },
  lateReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  lateReasonRowSel: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  lateReasonText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
});