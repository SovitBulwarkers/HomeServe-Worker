import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Alert, Linking, Image, Modal, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../../src/theme';
import { Card, StatusPill, IconBadge, statusLabel, statusTone } from '../../src/components/ui';
import Button from '../../src/components/Button';
import ImagePickerModal from '../../src/components/ImagePickerModal';
import ImageViewerModal from '../../src/components/ImageViewerModal';
import JobLocationMap from '../../src/components/JobLocationMap';
import { JobsAPI, Job, WorkerAPI, CustomerHistory, checkIsCodPayment } from '../../src/api/endpoints';

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

const RESCHEDULE_TIME_SLOTS = ['09:00 AM', '11:00 AM', '01:00 PM', '03:00 PM', '05:00 PM', '07:00 PM'];
const MAX_RESCHEDULE_COUNT = 3;

/** Next 7 days starting tomorrow, as offsets — reschedule must be in the future. */
function rescheduleDateOptions(): { offset: number; date: Date }[] {
  const out: { offset: number; date: Date }[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    out.push({ offset: i, date: d });
  }
  return out;
}

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workerLocation, setWorkerLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((pos) => setWorkerLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      .catch(() => {});
  }, []);
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
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [rescheduleDateOffset, setRescheduleDateOffset] = useState<number | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [sosModalVisible, setSosModalVisible] = useState(false);
  const [sosMessage, setSosMessage] = useState('');
  const [sosSending, setSosSending] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  // Extra-charge request: work outside the fixed package (gas refill,
  // spare part, extra labour). Sent to the customer for approval —
  // nothing is charged from this screen.
  const [extraChargeModalVisible, setExtraChargeModalVisible] = useState(false);
  const [extraChargeLabel, setExtraChargeLabel] = useState('');
  const [extraChargeAmount, setExtraChargeAmount] = useState('');
  const [extraChargeReason, setExtraChargeReason] = useState('');
  const [requestingExtraCharge, setRequestingExtraCharge] = useState(false);
  // Extra-time request: ask the customer to approve extending an
  // in-progress job past its scheduled duration. A small grace allowance
  // is applied automatically on the backend, so this may come back already
  // approved (no customer round-trip) when the ask is small enough.
  const [extraTimeModalVisible, setExtraTimeModalVisible] = useState(false);
  const [extraTimeMinutes, setExtraTimeMinutes] = useState('15');
  const [extraTimeReason, setExtraTimeReason] = useState('');
  const [requestingExtraTime, setRequestingExtraTime] = useState(false);
  // Ticks every 15s purely to re-render the "Request more time" button's
  // countdown below — no data fetching happens here.
  const [nowTick, setNowTick] = useState(() => Date.now());
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

  useEffect(() => {
    // Only bother ticking while the "Request more time" button could
    // plausibly be counting down (job in progress, just started).
    if (job?.status !== 'IN_PROGRESS' || !job.startedAt) return;
    const interval = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(interval);
  }, [job?.status, job?.startedAt]);

  // Mirrors BookingsService.requestExtraTime's `extra_time_min_minutes_after_start`
  // guard so the button doesn't invite a tap that the backend will reject.
  // 10 is the backend's own default when the AppSetting is unset; if an
  // operator has tuned it differently server-side, worst case the button
  // becomes tappable a little early/late and the existing server error
  // (with the real configured value) is the fallback safety net.
  const EXTRA_TIME_MIN_MINUTES_AFTER_START = 10;
  const minutesSinceStart = job?.startedAt
    ? (nowTick - new Date(job.startedAt).getTime()) / 60000
    : null;
  const extraTimeMinutesRemaining =
    minutesSinceStart === null
      ? 0
      : Math.max(0, Math.ceil(EXTRA_TIME_MIN_MINUTES_AFTER_START - minutesSinceStart));
  const extraTimeRequestAllowed = extraTimeMinutesRemaining === 0;

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

  const handleSubmitReschedule = async () => {
    if (!job || rescheduleDateOffset === null || !rescheduleTime) return;
    setRescheduling(true);
    try {
      const d = new Date();
      d.setDate(d.getDate() + rescheduleDateOffset);
      d.setHours(0, 0, 0, 0);
      await JobsAPI.reschedule(job.id, d.toISOString(), rescheduleTime);
      setRescheduleModalVisible(false);
      setRescheduleDateOffset(null);
      setRescheduleTime(null);
      Alert.alert('Reschedule requested', "The customer's been notified of the new time.");
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || "Couldn't reschedule this job. Please try again.");
    } finally {
      setRescheduling(false);
    }
  };

  const handleSosSend = async () => {
    if (!job) return;
    setSosSending(true);
    try {
      // Best-effort location — an SOS shouldn't be blocked on GPS being
      // slow or permission being denied; send what we have.
      let latitude: number | undefined;
      let longitude: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        }
      } catch {
        // Ignore — location is optional context, not a prerequisite.
      }

      await JobsAPI.raiseSos(job.id, { latitude, longitude, message: sosMessage.trim() || undefined });
      setSosSent(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || "Couldn't send SOS. Please try again or call support directly.");
    } finally {
      setSosSending(false);
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

  const isCodPayment = checkIsCodPayment(job);
  const itemsSubtotal = (job.items ?? []).reduce(
    (sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1),
    0,
  );
  const baseAmount = itemsSubtotal > 0 ? itemsSubtotal : (job.totalAmount ?? totalAmount);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* Native Header */}
      <View style={styles.nativeHeaderBar}>
        <Pressable onPress={() => router.back()} style={styles.nativeBackBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.nativeHeaderTitle}>Job Details</Text>
          <Text style={styles.nativeHeaderSub}>#{job.bookingNumber}</Text>
        </View>
        {['ACCEPTED', 'IN_PROGRESS'].includes(job.status) ? (
          <Pressable onPress={() => setSosModalVisible(true)} style={styles.nativeSosBtn}>
            <Text style={styles.nativeSosText}>SOS</Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
        {/* OVERDUE BANNER */}
        {isOverdue ? (
          <View style={styles.overdueBanner}>
            <Ionicons name="time-outline" size={16} color={colors.danger} />
            <Text style={styles.overdueBannerText}>
              Overdue — scheduled for {formatScheduled(job)}. Please complete or contact customer.
            </Text>
          </View>
        ) : null}

        {/* HERO CARD */}
        <Card style={styles.projectCard}>
          <View style={styles.heroHeaderRow}>
            <Text style={styles.heroTitle}>{serviceName}</Text>
            <Text style={styles.heroPrice}>₹{totalAmount.toFixed(2)}</Text>
          </View>

          <View style={styles.heroMetaRow}>
            <StatusPill label={statusLabel(job.status)} tone={statusTone(job.status)} />
            <Text style={styles.appleDot}>•</Text>
            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.heroTimeText}>{formatScheduled(job)}</Text>
          </View>

          <Pressable
            style={styles.heroTimelineLink}
            onPress={() => router.push({ pathname: '/job/timeline', params: { id: job.id } })}
          >
            <Text style={styles.heroTimelineText}>View booking timeline</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
        </Card>

        {/* PAYMENT STATUS BANNER */}
        {isCodPayment ? (
          <View style={styles.codBannerCard}>
            <Ionicons name="cash-outline" size={20} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={styles.codBannerTitle}>Collect Cash: ₹{totalAmount.toFixed(2)}</Text>
              <Text style={styles.codBannerSub}>Cash on Delivery (COD). Collect cash from customer upon job completion.</Text>
            </View>
          </View>
        ) : (
          <View style={styles.paidBannerCard}>
            <Ionicons name="checkmark-circle" size={20} color="#065F46" />
            <View style={{ flex: 1 }}>
              <Text style={styles.paidBannerTitle}>Paid Online: ₹{totalAmount.toFixed(2)}</Text>
              <Text style={styles.paidBannerSub}>Payment collected online via UPI/Prepaid. Do NOT collect cash from customer.</Text>
            </View>
          </View>
        )}

        {/* CUSTOMER & LOCATION CARD */}
        <Card style={styles.projectCard}>
          <Text style={styles.cardSectionTitle}>Customer & Location</Text>

          {/* Top Customer Info Row */}
          <View style={styles.customerHeaderRow}>
            {job.user?.avatar ? (
              <Image source={{ uri: job.user.avatar }} style={styles.customerAvatarImg} />
            ) : (
              <View style={styles.customerAvatarPlaceholder}>
                <Text style={styles.customerAvatarText}>{(job.user?.name ?? 'C').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{job.user?.name ?? 'Customer'}</Text>
              <Text style={styles.customerPhone}>
                {job.user?.phone || 'Phone shared after accept'}
              </Text>
            </View>
          </View>

          {/* Contact Action Buttons Row */}
          <View style={styles.contactBtnRowFull}>
            {['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(job.status) && job.user?.phone ? (
              <Pressable onPress={callCustomer} style={styles.projectCallBtnFull}>
                <Ionicons name="call" size={15} color={colors.white} />
                <Text style={styles.contactBtnText}>Call</Text>
              </Pressable>
            ) : null}

            <Pressable onPress={openChat} style={styles.projectChatBtnFull}>
              <Ionicons name="chatbubble" size={15} color={colors.white} />
              <Text style={styles.contactBtnText}>Chat</Text>
            </Pressable>
          </View>

          {/* Service Address Box */}
          {job.address?.fullAddress ? (
            <View style={styles.addressBoxContainer}>
              <View style={styles.addressHeaderLabelRow}>
                <Ionicons name="location" size={16} color={colors.primary} />
                <Text style={styles.addressLabelTitle}>SERVICE ADDRESS</Text>
              </View>

              <Text style={styles.addressMainText}>{job.address.fullAddress}</Text>

              {job.address.landmark ? (
                <View style={styles.landmarkTag}>
                  <Ionicons name="compass-outline" size={12} color="#B45309" />
                  <Text style={styles.landmarkTagText}>Landmark: {job.address.landmark}</Text>
                </View>
              ) : null}

              {['ACCEPTED', 'IN_PROGRESS'].includes(job.status) ? (
                <Pressable
                  style={styles.navMapBtn}
                  onPress={() => router.push({ pathname: '/job/track', params: { id: job.id } })}
                >
                  <Ionicons name="navigate" size={15} color={colors.primary} />
                  <Text style={styles.navMapBtnText}>Open Live Navigation & Map</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Card>

        {/* WORK PROOF PHOTOS CARD */}
        {['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(job.status) ? (
          <Card style={styles.projectCard}>
            <View style={styles.proofCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardSectionTitle}>Work Proof Photos</Text>
                <Text style={styles.proofSubTitle}>Add clear photos before starting & after completing</Text>
              </View>
              <View style={styles.requiredTag}>
                <Text style={styles.requiredTagText}>Required</Text>
              </View>
            </View>

            {/* BEFORE WORK SECTION */}
            <View style={styles.proofStageContainer}>
              <View style={styles.proofStageHeaderRow}>
                <View style={styles.stageTitleGroup}>
                  <Ionicons name="time-outline" size={15} color="#B45309" />
                  <Text style={styles.stageTitleBefore}>BEFORE WORK PHOTOS</Text>
                  <View style={styles.stageCountTagBefore}>
                    <Text style={styles.stageCountTextBefore}>{(job.proofBeforePhotos ?? []).length}</Text>
                  </View>
                </View>

                {['ACCEPTED', 'IN_PROGRESS'].includes(job.status) ? (
                  <Pressable
                    style={styles.addPhotoBtnBefore}
                    disabled={uploadingStage === 'before'}
                    onPress={() => setPickerModalStage('before')}
                  >
                    {uploadingStage === 'before' ? (
                      <ActivityIndicator size="small" color="#B45309" />
                    ) : (
                      <>
                        <Ionicons name="add-circle" size={15} color="#B45309" />
                        <Text style={styles.addPhotoBtnTextBefore}>+ Add Photo</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>

              {(job.proofBeforePhotos ?? []).length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoCarouselScroll}>
                  {(job.proofBeforePhotos ?? []).map((photoUrl, idx) => (
                    <Pressable
                      key={idx}
                      style={styles.carouselPhotoCard}
                      onPress={() => setPreviewImage({ url: photoUrl, title: `Before Work Photo ${idx + 1}` })}
                    >
                      <Image source={{ uri: photoUrl }} style={styles.carouselPhotoImg} />
                      <View style={styles.photoIndexBadgeBefore}>
                        <Text style={styles.photoIndexBadgeText}>#{idx + 1}</Text>
                      </View>
                    </Pressable>
                  ))}

                  {['ACCEPTED', 'IN_PROGRESS'].includes(job.status) ? (
                    <Pressable
                      style={styles.addSquareBtnBefore}
                      disabled={uploadingStage === 'before'}
                      onPress={() => setPickerModalStage('before')}
                    >
                      <Ionicons name="camera-outline" size={24} color="#B45309" />
                      <Text style={styles.addSquareBtnTextBefore}>+ Add</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              ) : ['ACCEPTED', 'IN_PROGRESS'].includes(job.status) ? (
                <Pressable
                  style={({ pressed }) => [styles.emptyUploadCardBefore, pressed && styles.addPhotoBtnActive]}
                  disabled={uploadingStage === 'before'}
                  onPress={() => setPickerModalStage('before')}
                >
                  {uploadingStage === 'before' ? (
                    <ActivityIndicator size="small" color="#B45309" />
                  ) : (
                    <>
                      <View style={styles.cameraIconCircleBefore}>
                        <Ionicons name="camera" size={22} color="#B45309" />
                      </View>
                      <Text style={styles.emptyUploadTitleBefore}>Upload Before Work Photos</Text>
                      <Text style={styles.emptyUploadSub}>Tap to capture or select from gallery</Text>
                    </>
                  )}
                </Pressable>
              ) : (
                <View style={styles.emptyPhotoStateBox}>
                  <Text style={styles.emptyPhotoStateText}>No before work photos added</Text>
                </View>
              )}
            </View>

            {/* AFTER WORK SECTION */}
            <View style={[styles.proofStageContainer, { marginTop: spacing.md }]}>
              <View style={styles.proofStageHeaderRow}>
                <View style={styles.stageTitleGroup}>
                  <Ionicons name="checkmark-done-circle-outline" size={16} color="#047857" />
                  <Text style={styles.stageTitleAfter}>AFTER WORK PHOTOS</Text>
                  <View style={styles.stageCountTagAfter}>
                    <Text style={styles.stageCountTextAfter}>{(job.proofAfterPhotos ?? []).length}</Text>
                  </View>
                </View>

                {job.status === 'IN_PROGRESS' ? (
                  <Pressable
                    style={styles.addPhotoBtnAfter}
                    disabled={uploadingStage === 'after'}
                    onPress={() => setPickerModalStage('after')}
                  >
                    {uploadingStage === 'after' ? (
                      <ActivityIndicator size="small" color="#047857" />
                    ) : (
                      <>
                        <Ionicons name="add-circle" size={15} color="#047857" />
                        <Text style={styles.addPhotoBtnTextAfter}>+ Add Photo</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>

              {(job.proofAfterPhotos ?? []).length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoCarouselScroll}>
                  {(job.proofAfterPhotos ?? []).map((photoUrl, idx) => (
                    <Pressable
                      key={idx}
                      style={styles.carouselPhotoCard}
                      onPress={() => setPreviewImage({ url: photoUrl, title: `After Work Photo ${idx + 1}` })}
                    >
                      <Image source={{ uri: photoUrl }} style={styles.carouselPhotoImg} />
                      <View style={styles.photoIndexBadgeAfter}>
                        <Text style={styles.photoIndexBadgeText}>#{idx + 1}</Text>
                      </View>
                    </Pressable>
                  ))}

                  {job.status === 'IN_PROGRESS' ? (
                    <Pressable
                      style={styles.addSquareBtnAfter}
                      disabled={uploadingStage === 'after'}
                      onPress={() => setPickerModalStage('after')}
                    >
                      <Ionicons name="camera-outline" size={24} color="#047857" />
                      <Text style={styles.addSquareBtnTextAfter}>+ Add</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              ) : job.status === 'IN_PROGRESS' ? (
                <Pressable
                  style={({ pressed }) => [styles.emptyUploadCardAfter, pressed && styles.addPhotoBtnActive]}
                  disabled={uploadingStage === 'after'}
                  onPress={() => setPickerModalStage('after')}
                >
                  {uploadingStage === 'after' ? (
                    <ActivityIndicator size="small" color="#047857" />
                  ) : (
                    <>
                      <View style={styles.cameraIconCircleAfter}>
                        <Ionicons name="camera" size={22} color="#047857" />
                      </View>
                      <Text style={styles.emptyUploadTitleAfter}>Upload After Work Photos</Text>
                      <Text style={styles.emptyUploadSub}>Tap to capture or select from gallery</Text>
                    </>
                  )}
                </Pressable>
              ) : isAccepted ? (
                <View style={styles.lockedStateCardBox}>
                  <Ionicons name="lock-closed" size={20} color={colors.textMuted} />
                  <Text style={styles.lockedStateTitle}>After Work Photos Locked</Text>
                  <Text style={styles.lockedStateSub}>Start job with OTP to unlock after-work uploads</Text>
                </View>
              ) : (
                <View style={styles.emptyPhotoStateBox}>
                  <Text style={styles.emptyPhotoStateText}>No after work photos added</Text>
                </View>
              )}
            </View>
          </Card>
        ) : null}

        {/* REQUESTED SERVICES CARD */}
        <Card style={styles.projectCard}>
          <Text style={styles.cardSectionTitle}>Requested Services</Text>

          {(job.items ?? []).map((item, idx) => (
            <View key={item.id ?? idx} style={styles.serviceItemRow}>
              <View style={styles.serviceIconCircle}>
                <Ionicons name="construct-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceItemName}>{item.service?.name ?? 'Service item'}</Text>
                {item.service?.description ? (
                  <Text style={styles.serviceItemDesc} numberOfLines={1}>{item.service.description}</Text>
                ) : null}
              </View>
              <Text style={styles.serviceQtyText}>x{item.quantity}</Text>
              <Text style={styles.servicePriceText}>₹{(item.price ?? totalAmount).toFixed(0)}</Text>
            </View>
          ))}
        </Card>

        {/* PAYMENT DETAILS CARD */}
        <Card style={styles.projectCard}>
          <Text style={styles.cardSectionTitle}>Payment Details</Text>

          <View style={styles.paymentDetailRow}>
            <Text style={styles.paymentDetailLabel}>Payment Method</Text>
            <Text style={styles.paymentDetailValue}>
              {job.payment?.method ?? (isCodPayment ? 'Cash on Delivery (COD)' : 'Online Payment')}
            </Text>
          </View>

          <View style={styles.paymentDetailRow}>
            <Text style={styles.paymentDetailLabel}>Payment Status</Text>
            <StatusPill
              label={isCodPayment ? 'COLLECT CASH' : 'PAID ONLINE'}
              tone={isCodPayment ? 'warning' : 'success'}
            />
          </View>

          {/* PRICE BREAKDOWN SECTION */}
          <View style={styles.breakdownDivider} />
          <Text style={styles.breakdownSectionTitle}>Price Breakdown</Text>

          {/* Base Services Subtotal */}
          <View style={styles.paymentDetailRow}>
            <Text style={styles.paymentDetailLabel}>Base Service Amount</Text>
            <Text style={styles.paymentDetailValue}>
              ₹{baseAmount.toFixed(2)}
            </Text>
          </View>

          {/* Extra Charges */}
          {(job.extraCharges ?? []).map((ch, idx) => {
            const isApproved = ch.status === 'APPROVED';
            const isPending = ch.status === 'PENDING';
            return (
              <View key={ch.id ?? idx} style={styles.paymentDetailRow}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <Text style={styles.paymentDetailLabel}>
                    Extra: {ch.label}
                  </Text>
                  <Text style={styles.breakdownSubText}>
                    {isApproved ? 'Approved by customer' : isPending ? 'Pending customer approval' : 'Rejected'}
                    {ch.reason ? ` · ${ch.reason}` : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.paymentDetailValue,
                    isPending && { color: colors.warning },
                    ch.status === 'REJECTED' && { textDecorationLine: 'line-through', opacity: 0.5 },
                  ]}
                >
                  +₹{ch.amount.toFixed(2)} {isPending ? '(Pending)' : ''}
                </Text>
              </View>
            );
          })}

          {/* Extra Time Requests */}
          {(job.extraTimeRequests ?? []).map((t, idx) => {
            const isApproved = t.status === 'APPROVED';
            const isPending = t.status === 'PENDING';
            return (
              <View key={t.id ?? idx} style={styles.paymentDetailRow}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <Text style={styles.paymentDetailLabel}>
                    Extra Time (+{t.requestedMinutes} mins)
                  </Text>
                  <Text style={styles.breakdownSubText}>
                    {isApproved ? 'Approved by customer' : isPending ? 'Pending customer approval' : 'Rejected'}
                    {t.reason ? ` · ${t.reason}` : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.paymentDetailValue,
                    isPending && { color: colors.warning },
                    t.status === 'REJECTED' && { textDecorationLine: 'line-through', opacity: 0.5 },
                  ]}
                >
                  +₹{t.amount.toFixed(2)} {isPending ? '(Pending)' : ''}
                </Text>
              </View>
            );
          })}

          {/* Taxes & Fees */}
          {job.taxAmount && job.taxAmount > 0 ? (
            <View style={styles.paymentDetailRow}>
              <Text style={styles.paymentDetailLabel}>Taxes & Service Fees</Text>
              <Text style={styles.paymentDetailValue}>+₹{job.taxAmount.toFixed(2)}</Text>
            </View>
          ) : null}

          {/* Discount */}
          {job.discountAmount && job.discountAmount > 0 ? (
            <View style={styles.paymentDetailRow}>
              <Text style={styles.paymentDetailLabel}>Discount Applied</Text>
              <Text style={[styles.paymentDetailValue, { color: colors.success }]}>
                -₹{job.discountAmount.toFixed(2)}
              </Text>
            </View>
          ) : null}

          <View style={styles.paymentTotalRow}>
            <Text style={styles.paymentTotalLabel}>{isCodPayment ? 'Cash to Collect' : 'Total Amount'}</Text>
            <Text style={styles.paymentTotalValue}>₹{totalAmount.toFixed(2)}</Text>
          </View>
        </Card>

        {/* JOB ACTIONS CARD */}
        {['ACCEPTED', 'IN_PROGRESS'].includes(job.status) ? (
          <Card style={styles.projectCard}>
            <Text style={styles.cardSectionTitle}>Job Actions</Text>

            <View style={styles.quickActionsGrid}>
              {/* Running Late */}
              <Pressable
                style={styles.actionGridCard}
                onPress={() => {
                  setLateMinutes(15);
                  setLateReason(null);
                  setLateModalVisible(true);
                }}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="time" size={18} color="#D97706" />
                </View>
                <Text style={styles.actionGridTitle}>
                  {job.runningLateMinutes ? `Late (+${job.runningLateMinutes}m)` : 'Running Late'}
                </Text>
                <Text style={styles.actionGridSub}>Notify customer</Text>
              </Pressable>

              {/* Reschedule */}
              {job.status === 'ACCEPTED' ? (
                <Pressable
                  style={styles.actionGridCard}
                  onPress={() => {
                    setRescheduleDateOffset(null);
                    setRescheduleTime(null);
                    setRescheduleModalVisible(true);
                  }}
                >
                  <View style={[styles.actionIconCircle, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="calendar" size={18} color="#4F46E5" />
                  </View>
                  <Text style={styles.actionGridTitle}>Reschedule</Text>
                  <Text style={styles.actionGridSub}>
                    {job.pendingRescheduleDate ? 'Pending...' : 'Change time'}
                  </Text>
                </Pressable>
              ) : null}

              {/* Cancel */}
              {job.status === 'ACCEPTED' ? (
                <Pressable
                  style={styles.actionGridCard}
                  onPress={() => {
                    setCancelReason('');
                    setCancelModalVisible(true);
                  }}
                >
                  <View style={[styles.actionIconCircle, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="close-circle" size={18} color="#DC2626" />
                  </View>
                  <Text style={[styles.actionGridTitle, { color: colors.danger }]}>Cancel</Text>
                  <Text style={styles.actionGridSub}>Cancel job</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Extra Charge Button */}
            {job.status === 'IN_PROGRESS' ? (
              <Pressable
                style={styles.utilityActionBtn}
                onPress={() => {
                  setExtraChargeAmount('');
                  setExtraChargeReason('');
                  setExtraChargeModalVisible(true);
                }}
              >
                <Ionicons name="cash-outline" size={18} color={colors.primary} />
                <Text style={styles.utilityActionText}>Request Extra Charge</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}

            {/* Extra Time Button */}
            {job.status === 'IN_PROGRESS' &&
            !job.extraTimeRequests?.some((t) => t.status === 'PENDING') ? (
              <Pressable
                style={[styles.utilityActionBtn, !extraTimeRequestAllowed && { opacity: 0.6 }]}
                disabled={!extraTimeRequestAllowed}
                onPress={() => {
                  setExtraTimeMinutes('15');
                  setExtraTimeReason('');
                  setExtraTimeModalVisible(true);
                }}
              >
                <Ionicons name="hourglass-outline" size={18} color={colors.warning} />
                <Text style={styles.utilityActionText}>
                  {extraTimeRequestAllowed
                    ? 'Request More Work Time'
                    : `Available in ${extraTimeMinutesRemaining} min`}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </Card>
        ) : null}

        {['COMPLETED', 'CANCELLED'].includes(job.status) && job.payment ? (
          <Pressable
            style={styles.disputeLinkBtn}
            onPress={() => router.push({ pathname: '/disputes/new', params: { bookingId: job.id } })}
          >
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.disputeLinkText}>Something wrong with this job? Raise a dispute</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.danger} />
          </Pressable>
        ) : null}
      </ScrollView>

      {/* DOCKED FOOTER */}
      <View style={styles.dockedFooter}>
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
          <Button
            title="Start job"
            loading={acting}
            style={styles.primaryCtaBtn}
            onPress={() => { setStartOtpDigits(['', '', '', '']); setStartError(''); setStartModalVisible(true); }}
          />
        ) : job.status === 'IN_PROGRESS' ? (
          <Button
            title="Mark as completed"
            loading={acting}
            style={styles.primaryCtaBtn}
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

      {/* Emergency SOS Modal */}
      {sosModalVisible && (
      <Modal
        visible={sosModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSosModalVisible(false);
          setSosSent(false);
          setSosMessage('');
        }}
      >
        <Pressable
          style={styles.centerModalOverlay}
          onPress={() => {
            if (sosSending) return;
            setSosModalVisible(false);
            setSosSent(false);
            setSosMessage('');
          }}
        >
          <Pressable style={styles.centerModalCard} onPress={(e) => e.stopPropagation()}>
            {sosSent ? (
              <>
                <Ionicons name="checkmark-circle" size={40} color={colors.success} style={{ alignSelf: 'center', marginBottom: spacing.sm }} />
                <Text style={styles.simpleModalTitle}>Help is on the way</Text>
                <Text style={styles.simpleModalSub}>
                  Support has been alerted with your location and job details. Stay safe — they'll reach out shortly.
                </Text>
                <Button
                  title="Close"
                  onPress={() => {
                    setSosModalVisible(false);
                    setSosSent(false);
                    setSosMessage('');
                  }}
                  style={{ marginTop: spacing.md }}
                />
              </>
            ) : (
              <>
                <Ionicons name="alert-circle" size={40} color={colors.danger} style={{ alignSelf: 'center', marginBottom: spacing.sm }} />
                <Text style={styles.simpleModalTitle}>Emergency SOS</Text>
                <Text style={styles.simpleModalSub}>
                  This immediately alerts HomeServe support with your current location and this job's details. Use this only for a genuine safety emergency.
                </Text>

                <TextInput
                  style={styles.cancelReasonInput}
                  placeholder="What's happening? (optional)"
                  placeholderTextColor={colors.textMuted}
                  value={sosMessage}
                  onChangeText={setSosMessage}
                  multiline
                />

                <Button
                  title="Send SOS now"
                  variant="danger"
                  loading={sosSending}
                  style={{ marginTop: spacing.md }}
                  onPress={handleSosSend}
                />
                <Pressable
                  style={styles.simpleCancelBtn}
                  onPress={() => {
                    setSosModalVisible(false);
                    setSosMessage('');
                  }}
                >
                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.semibold }}>
                    Cancel
                  </Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      )}

      {/* Reschedule Request Modal */}
      {rescheduleModalVisible && (
      <Modal
        visible={rescheduleModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRescheduleModalVisible(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setRescheduleModalVisible(false)}>
          <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandleBar} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderIconWrap}>
                <Ionicons name="calendar-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Reschedule Request</Text>
                <Text style={styles.sheetSubtitle}>Choose a new date & time slot for this job</Text>
              </View>
              <Pressable onPress={() => setRescheduleModalVisible(false)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.currentScheduleBanner}>
              <Ionicons name="time-outline" size={16} color={colors.primary} />
              <Text style={styles.currentScheduleText}>
                Currently: <Text style={{ fontWeight: fontWeight.bold }}>{formatScheduled(job)}</Text>
              </Text>
            </View>

            {(job.rescheduleCount ?? 0) >= MAX_RESCHEDULE_COUNT ? (
              <View style={styles.maxRescheduleAlert}>
                <Ionicons name="alert-circle" size={20} color={colors.danger} />
                <Text style={styles.maxRescheduleText}>
                  This booking has reached the maximum allowed reschedules ({MAX_RESCHEDULE_COUNT} times). Please cancel and ask the customer to rebook.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                {/* Date Selection */}
                <Text style={styles.fieldSectionLabel}>Select New Date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipHorizontalScroll}>
                  {rescheduleDateOptions().map(({ offset, date }) => {
                    const isSel = rescheduleDateOffset === offset;
                    const dayName = date.toLocaleDateString('en-IN', { weekday: 'short' });
                    const dateNum = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                    return (
                      <Pressable
                        key={offset}
                        style={[styles.rescheduleDateCard, isSel && styles.rescheduleDateCardSel]}
                        onPress={() => setRescheduleDateOffset(offset)}
                      >
                        <Text style={[styles.rescheduleDayName, isSel && styles.rescheduleDayNameSel]}>
                          {dayName}
                        </Text>
                        <Text style={[styles.rescheduleDateNum, isSel && styles.rescheduleDateNumSel]}>
                          {dateNum}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Time Slot Selection */}
                <Text style={[styles.fieldSectionLabel, { marginTop: spacing.md }]}>Select Time Slot</Text>
                <View style={styles.timeSlotsGrid}>
                  {RESCHEDULE_TIME_SLOTS.map((t) => {
                    const isSel = rescheduleTime === t;
                    return (
                      <Pressable
                        key={t}
                        style={[styles.rescheduleTimeChip, isSel && styles.rescheduleTimeChipSel]}
                        onPress={() => setRescheduleTime(t)}
                      >
                        <Ionicons
                          name="time-outline"
                          size={14}
                          color={isSel ? colors.white : colors.textSecondary}
                        />
                        <Text style={[styles.rescheduleTimeText, isSel && styles.rescheduleTimeTextSel]}>
                          {t}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Selected Summary */}
                {rescheduleDateOffset !== null && rescheduleTime ? (
                  <View style={styles.rescheduleSummaryBox}>
                    <Ionicons name="information-circle" size={16} color={colors.primary} />
                    <Text style={styles.rescheduleSummaryText}>
                      Customer will be notified of proposed change to{' '}
                      <Text style={{ fontWeight: fontWeight.bold }}>
                        {rescheduleDateOptions().find((d) => d.offset === rescheduleDateOffset)?.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                        at {rescheduleTime}
                      </Text>
                    </Text>
                  </View>
                ) : null}

                <Button
                  title="Submit Reschedule Request"
                  loading={rescheduling}
                  disabled={rescheduleDateOffset === null || !rescheduleTime}
                  style={{ marginTop: spacing.lg }}
                  onPress={handleSubmitReschedule}
                />
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      )}

      {/* Cancel Job Modal — shows the impact preview before confirming.
          Worker-initiated cancellations always trigger a full refund to
          the customer (see cancellation-policy.util.ts on the backend:
          cancelledBy !== 'CUSTOMER' -> STAFF_INITIATED -> 0% fee), so the
          "preview" here is a straightforward, honest heads-up rather than
          a computed fee breakdown — there's no worker-favourable fee
          scenario to compute. */}
      {cancelModalVisible && (
      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelModalVisible(false)}
      >
        <Pressable style={styles.centerModalOverlay} onPress={() => setCancelModalVisible(false)}>
          <Pressable style={styles.centerModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.simpleModalTitle}>Cancel this job?</Text>
            <Text style={styles.simpleModalSub}>
              This will cancel the booking with {job.user?.name || 'the customer'} and offer the slot to another worker.
            </Text>

            <View style={styles.cancelImpactBox}>
              <Ionicons name="information-circle" size={18} color={colors.danger} />
              <Text style={styles.cancelImpactText}>
                {job.finalAmount > 0
                  ? `The customer will get a full refund of ₹${job.finalAmount}. No fee applies since you're the one cancelling.`
                  : "No payment was made yet, so there's nothing to refund."}
              </Text>
            </View>

            <Text style={styles.simpleModalSub}>Reason for cancelling (required)</Text>
            <TextInput
              style={styles.cancelReasonInput}
              placeholder="e.g. Vehicle broke down, family emergency…"
              placeholderTextColor={colors.textMuted}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />

            <Button
              title="Confirm cancellation"
              variant="danger"
              loading={acting}
              disabled={!cancelReason.trim()}
              style={{ marginTop: spacing.md }}
              onPress={() => {
                setCancelModalVisible(false);
                runAction(
                  () => JobsAPI.cancel(job.id, cancelReason.trim()),
                  'Booking cancelled.',
                );
              }}
            />
            <Pressable style={styles.simpleCancelBtn} onPress={() => setCancelModalVisible(false)}>
              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.semibold }}>
                Never mind, keep the job
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

      {extraTimeModalVisible && (
      <Modal
        visible={extraTimeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExtraTimeModalVisible(false)}
      >
        <Pressable style={styles.centerModalOverlay} onPress={() => setExtraTimeModalVisible(false)}>
          <Pressable style={styles.centerModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.completeIconCircle}>
              <Ionicons name="hourglass" size={32} color={colors.warning} />
            </View>
            <Text style={styles.simpleModalTitle}>Request Extra Time</Text>
            <Text style={styles.simpleModalSub}>
              A small amount is free under the grace period — anything beyond that is sent to the
              customer for approval before it's charged.
            </Text>

            <TextInput
              style={styles.extraChargeInput}
              placeholder="Extra minutes needed"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              value={extraTimeMinutes}
              onChangeText={setExtraTimeMinutes}
            />
            <TextInput
              style={[styles.extraChargeInput, { height: 72, textAlignVertical: 'top' }]}
              placeholder="Why do you need more time? (optional)"
              placeholderTextColor={colors.textMuted}
              multiline
              value={extraTimeReason}
              onChangeText={setExtraTimeReason}
            />

            <Button
              title="Send Request"
              loading={requestingExtraTime}
              disabled={!Number(extraTimeMinutes) || Number(extraTimeMinutes) <= 0}
              onPress={async () => {
                if (!job) return;
                setRequestingExtraTime(true);
                try {
                  const { data } = await JobsAPI.requestExtraTime(job.id, {
                    extraMinutes: Number(extraTimeMinutes),
                    reason: extraTimeReason.trim() || undefined,
                  });
                  setExtraTimeModalVisible(false);
                  Alert.alert(
                    data?.requiresApproval ? 'Sent' : 'Time added',
                    data?.message || "We've asked the customer to approve this.",
                  );
                  load();
                } catch (e: any) {
                  Alert.alert('Error', e?.response?.data?.message || 'Could not send the request. Please try again.');
                } finally {
                  setRequestingExtraTime(false);
                }
              }}
              style={styles.confirmBtn}
            />
            <Pressable style={styles.simpleCancelBtn} onPress={() => setExtraTimeModalVisible(false)}>
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

  flatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  flatBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flatHeaderTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  flatHeaderSubTitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  flatSosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
  },
  flatSosBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  flatScrollView: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  flatContentContainer: {
    paddingBottom: spacing.xxxl + 20,
  },
  heroSection: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroTitle: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    flex: 1,
    paddingRight: spacing.md,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  heroPriceText: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  heroDotSeparator: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  heroTimeBoxInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroTimeInlineText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  heroTimelineLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  appleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  appleBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    alignItems: 'center',
    justify: 'center',
  },
  appleHeaderTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  appleHeaderSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  appleSosBtn: {
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  appleSosText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  appleScrollView: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  appleContent: {
    paddingBottom: spacing.xxxl + 20,
  },
  appleHeroSection: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
  },
  appleHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  appleHeroTitle: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    flex: 1,
    paddingRight: spacing.md,
  },
  appleHeroPrice: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  appleHeroSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  appleDot: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  appleHeroTime: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  appleTimelineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
  },
  appleTimelineText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  appleDivider: {
    height: 8,
    backgroundColor: '#F3F4F6',
  },
  appleCashBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: '#FEF3C7',
  },
  appleCashTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#92400E',
  },
  appleCashSub: {
    fontSize: fontSize.xs,
    color: '#B45309',
    marginTop: 1,
  },
  applePaidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: '#ECFDF5',
  },
  applePaidTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#065F46',
  },
  applePaidSub: {
    fontSize: fontSize.xs,
    color: '#047857',
    marginTop: 1,
  },
  appleSection: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
  },
  appleSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  appleSubTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  appleCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appleAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  appleAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleAvatarText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  appleCustomerName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  appleCustomerPhone: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  appleContactRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  appleCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
  },
  appleChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
  },
  // Project UI Styles (matching Earnings / HomeServe theme)
  nativeHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nativeBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeHeaderTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  nativeHeaderSub: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  nativeSosBtn: {
    backgroundColor: colors.dangerLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  nativeSosText: {
    fontSize: 11,
    fontWeight: fontWeight.extrabold,
    color: colors.danger,
  },

  projectCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },

  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  heroPrice: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heroTimeText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  heroTimelineLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  heroTimelineText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },

  codBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  codBannerTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#B45309',
  },
  codBannerSub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  paidBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  paidBannerTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#065F46',
  },
  paidBannerSub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },

  cardSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  customerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  customerAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  customerAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  customerName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  customerPhone: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  contactBtnRowFull: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  projectCallBtnFull: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  projectChatBtnFull: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  contactBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },

  addressBoxContainer: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 6,
  },
  addressHeaderLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addressLabelTitle: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  addressMainText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  addressTextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  addressText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  landmarkTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningLight,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  landmarkTagText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#B45309',
  },
  navMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  navMapBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },

  proofCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  proofSubTitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  requiredTag: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  requiredTagText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#B45309',
  },

  proofStageContainer: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  proofStageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  stageTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stageTitleBefore: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: '#B45309',
    letterSpacing: 0.5,
  },
  stageTitleAfter: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: '#047857',
    letterSpacing: 0.5,
  },
  stageCountTagBefore: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  stageCountTextBefore: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: '#B45309',
  },
  stageCountTagAfter: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  stageCountTextAfter: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: '#047857',
  },
  addPhotoBtnBefore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  addPhotoBtnTextBefore: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#B45309',
  },
  addPhotoBtnAfter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  addPhotoBtnTextAfter: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#047857',
  },

  photoCarouselScroll: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    paddingVertical: 2,
  },
  carouselPhotoCard: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  carouselPhotoImg: {
    width: '100%',
    height: '100%',
  },
  photoIndexBadgeBefore: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    backgroundColor: 'rgba(180, 83, 9, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  photoIndexBadgeAfter: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    backgroundColor: 'rgba(4, 120, 87, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  photoIndexBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  addSquareBtnBefore: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderStyle: 'dashed',
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addSquareBtnTextBefore: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#B45309',
  },
  addSquareBtnAfter: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addSquareBtnTextAfter: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#047857',
  },
  emptyUploadCardBefore: {
    height: 84,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderStyle: 'dashed',
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  emptyUploadCardAfter: {
    height: 84,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cameraIconCircleBefore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIconCircleAfter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyUploadTitleBefore: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: '#B45309',
  },
  emptyUploadTitleAfter: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: '#047857',
  },
  emptyUploadSub: {
    fontSize: 10,
    color: colors.textMuted,
  },
  emptyPhotoStateBox: {
    padding: spacing.md,
    alignItems: 'center',
  },
  emptyPhotoStateText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  lockedStateCardBox: {
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  lockedStateTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  lockedStateSub: {
    fontSize: 10,
    color: colors.textMuted,
  },

  serviceItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  serviceIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceItemName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  serviceItemDesc: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  serviceQtyText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    marginRight: spacing.xs,
  },
  servicePriceText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },

  paymentDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  paymentDetailLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  paymentDetailValue: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  paymentTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  paymentTotalLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  paymentTotalValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  appleAddressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
  },
  appleAddressIconBg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modern Customer & Location Styles
  modernCustomerCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modernCustomerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  modernAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modernAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernAvatarText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  modernCustomerName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  modernCustomerPhone: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modernContactBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  modernCallBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  modernCallBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  modernChatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  modernChatBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  modernAddressContainer: {
    marginTop: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modernAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  modernLocationIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernAddressSubTitle: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  modernAddressText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  modernLandmarkText: {
    fontSize: fontSize.xs,
    color: '#B45309',
    marginTop: 4,
    fontWeight: fontWeight.medium,
  },
  modernNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  modernNavBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    flex: 1,
    textAlign: 'center',
  },

  // Multi-Photo Carousel Styles
  multiProofBlock: {
    backgroundColor: '#FAFAFA',
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  multiProofHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm + 2,
  },
  multiProofTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  multiProofTitleBefore: {
    fontSize: 11,
    fontWeight: fontWeight.extrabold,
    color: '#B45309',
    letterSpacing: 0.5,
  },
  multiProofTitleAfter: {
    fontSize: 11,
    fontWeight: fontWeight.extrabold,
    color: '#047857',
    letterSpacing: 0.5,
  },
  multiProofCountBadgeBefore: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  multiProofCountTextBefore: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#B45309',
  },
  multiProofCountBadgeAfter: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  multiProofCountTextAfter: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#047857',
  },
  multiAddMoreBtnBefore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  multiAddMoreTextBefore: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: '#B45309',
  },
  multiAddMoreBtnAfter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  multiAddMoreTextAfter: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: '#047857',
  },
  multiPhotoScroll: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    alignItems: 'center',
    paddingVertical: 4,
  },
  multiPhotoCard: {
    position: 'relative',
    width: 90,
    height: 90,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  multiPhotoImg: {
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
  },
  multiPhotoIndexTagBefore: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(180, 83, 9, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  multiPhotoIndexTagAfter: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(4, 120, 87, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  multiPhotoIndexText: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  multiAddSquareBefore: {
    width: 90,
    height: 90,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderStyle: 'dashed',
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  multiAddSquareTextBefore: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#B45309',
  },
  multiAddSquareAfter: {
    width: 90,
    height: 90,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  multiAddSquareTextAfter: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#047857',
  },
  multiEmptyUploadBoxBefore: {
    height: 100,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderStyle: 'dashed',
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  multiEmptyUploadBoxAfter: {
    height: 100,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  modernProofSubText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modernRequiredBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  modernRequiredText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#B45309',
    textTransform: 'uppercase',
  },
  modernProofGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modernProofCard: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    borderRadius: radius.xl,
    padding: spacing.sm + 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modernProofCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.xs + 2,
  },
  modernProofCardTitleBefore: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: '#B45309',
    letterSpacing: 0.5,
  },
  modernProofCardTitleAfter: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: '#047857',
    letterSpacing: 0.5,
  },
  modernPhotoPreviewWrapper: {
    gap: 6,
  },
  modernPhotoTouch: {
    position: 'relative',
    height: 110,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  modernProofImg: {
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
  },
  modernPhotoCountTag: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(180, 83, 9, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  modernPhotoCountTagAfter: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(4, 120, 87, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  modernPhotoCountText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  modernRetakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  modernRetakeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#B45309',
  },
  modernRetakeBtnAfter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  modernRetakeTextAfter: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#047857',
  },
  modernAddPhotoBoxBefore: {
    height: 110,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderStyle: 'dashed',
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  modernCameraCircleBefore: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernAddPhotoTitleBefore: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#B45309',
  },
  modernAddPhotoSub: {
    fontSize: 10,
    color: colors.textMuted,
  },
  modernAddPhotoBoxAfter: {
    height: 110,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  modernCameraCircleAfter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernAddPhotoTitleAfter: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#047857',
  },
  modernLockedCardBox: {
    height: 110,
    borderRadius: radius.lg,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  modernLockedTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modernLockedSub: {
    fontSize: 10,
    color: colors.textMuted,
  },
  modernEmptyBox: {
    height: 110,
    borderRadius: radius.lg,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernEmptyText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  appleAddressBodyText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  appleLandmarkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  appleLandmarkBoxText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: '#92400E',
  },
  appleAddressActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  appleAddrActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  appleAddrActionBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  appleAddrActionBtnSec: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  appleAddrActionBtnTextSec: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  appleMapWrapper: {
    marginTop: spacing.md,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  appleNavigateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    marginTop: spacing.md,
  },
  appleNavigateBarText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.white,
    flex: 1,
    textAlign: 'center',
  },
  applePhotoSquare: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
  },
  appleAddPhotoBox: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleAddPhotoText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    marginTop: 2,
  },
  appleLockedBox: {
    width: 140,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  appleLockedText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  appleServiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  appleServiceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleServiceName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  appleServiceDesc: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  appleQtyText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  appleServicePrice: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  applePaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
  },
  applePaymentLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  applePaymentValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  appleTotalLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  appleTotalValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  customerPillActions: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  pillCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  pillChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  pillActionText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  locationInlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flatAddressText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  flatLandmarkText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  equalProofHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  equalProofSubLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  equalProofGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  equalProofCard: {
    flex: 1,
  },
  equalCardLabelBefore: {
    fontSize: 11,
    fontWeight: fontWeight.extrabold,
    color: '#D97706',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  equalCardLabelAfter: {
    fontSize: 11,
    fontWeight: fontWeight.extrabold,
    color: '#059669',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  equalPhotoUploadedBox: {
    height: 110,
    borderRadius: radius.xl,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  equalPhotoImg: {
    width: '100%',
    height: '100%',
  },
  equalBadgeOverlayBefore: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(217, 119, 6, 0.85)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  equalBadgeOverlayAfter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(5, 150, 105, 0.85)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  equalBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  equalAddBoxBefore: {
    height: 110,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderStyle: 'dashed',
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  equalAddBoxAfter: {
    height: 110,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  equalAddTextBefore: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#D97706',
  },
  equalAddTextAfter: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#059669',
  },
  equalLockedBox: {
    height: 110,
    borderRadius: radius.xl,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: spacing.xs,
  },
  equalLockedText: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: fontWeight.medium,
  },
  equalNoPhotoBox: {
    height: 110,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equalNoPhotoText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  proofHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  reqBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  proofStageFullCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  photoThumbWrapperFull: {
    width: 100,
    height: 100,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  fullAddPhotoBtn: {
    width: 100,
    height: 100,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderStyle: 'dashed',
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  afterAddPhotoBtn: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  lockedPhotoFullBox: {
    width: 160,
    height: 100,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    gap: 4,
  },
  proofColumnsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  proofColumnCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  proofStageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  proofStageBadgeTitle: {
    fontSize: 11,
    fontWeight: fontWeight.extrabold,
    color: '#D97706',
    letterSpacing: 0.5,
  },
  proofStageBadgeCount: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
  },
  photoBoxContainer: {
    marginTop: 4,
  },
  emptyPhotoUploadBox: {
    height: 110,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  beforeUploadBox: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  afterUploadBox: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  cameraIconCircleBefore: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cameraIconCircleAfter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  uploadBoxTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#D97706',
    textAlign: 'center',
  },
  uploadBoxSub: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  photoThumbWrapper: {
    width: 90,
    height: 90,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  proofPhotoCardImage: {
    width: '100%',
    height: '100%',
  },
  photoTagOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(217, 119, 6, 0.85)',
    paddingVertical: 2,
    alignItems: 'center',
  },
  photoTagOverlayText: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  miniAddPhotoCard: {
    width: 44,
    height: 90,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedPhotoColumnBox: {
    height: 100,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    gap: 4,
  },
  lockedPhotoColumnText: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
  noPhotoPlaceholder: {
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionGridCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  actionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionGridTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  actionGridSub: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  collectCashBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  collectCashIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectCashTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.extrabold,
    color: '#92400E',
    letterSpacing: 0.5,
  },
  collectCashSub: {
    fontSize: fontSize.xs,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 16,
  },
  onlinePaidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  onlinePaidText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#065F46',
  },
  paymentSummaryCardCod: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderWidth: 1.5,
  },
  utilityActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  utilityActionText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  dockedFooter: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    ...shadow.raised,
  },
  primaryCtaBtn: {
    height: 52,
    borderRadius: radius.xl,
  },
  flatServiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  serviceIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flatServiceName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  flatServiceDesc: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  qtyBadge: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  qtyBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  flatServicePrice: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  serviceCoverageBox: {
    marginTop: spacing.md,
    backgroundColor: '#F9FAFB',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
  },
  coverageHeader: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  coverageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coverageText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  paymentSummaryCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  paymentDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentLabelText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  paymentValueText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  paymentDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xs,
  },
  paymentTotalLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  paymentTotalValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  cleanSectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  callCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerLight: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xs,
  },
  cleanNavigateBtn: {
    marginTop: spacing.sm,
    borderRadius: radius.xl,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
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
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  itemName: { fontSize: fontSize.md, color: colors.textPrimary, flex: 1 },
  itemQty: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.semibold },
  metaText: { fontSize: fontSize.sm, color: colors.textSecondary, flex: 1 },
  customerRow: { flexDirection: 'row', alignItems: 'center' },
  customerAvatar: { width: 42, height: 42, borderRadius: 21 },
  customerName: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  customerPhone: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  privacyNote: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  addressBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: spacing.xs },
  addressText: { fontSize: fontSize.sm, color: colors.textPrimary, flex: 1, lineHeight: 20 },
  landmarkText: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, marginLeft: 24 },
  contactButtonsRow: { flexDirection: 'row', gap: spacing.xs },
  footer: { padding: spacing.xl, borderTopWidth: 1, borderTopColor: colors.borderLight, backgroundColor: colors.surface, gap: spacing.sm },
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
  lateLinkBtnDisabled: {
    opacity: 0.5,
  },
  lateLinkTextDisabled: {
    color: colors.textSecondary,
  },
  disputeLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerLight,
  },
  disputeLinkText: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.danger,
  },
  timelineLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  timelineLinkText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
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
  cancelImpactBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radius.md,
    width: '100%',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  cancelImpactText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.danger,
    fontWeight: fontWeight.semibold,
    lineHeight: 16,
  },
  cancelReasonInput: {
    width: '100%',
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    textAlignVertical: 'top',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    maxHeight: '85%',
  },
  sheetHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sheetHeaderIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  sheetSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  sheetCloseBtn: {
    padding: spacing.xs,
  },
  currentScheduleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  currentScheduleText: {
    fontSize: fontSize.xs,
    color: colors.textPrimary,
  },
  maxRescheduleAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  maxRescheduleText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.danger,
    fontWeight: fontWeight.semibold,
  },
  fieldSectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  chipHorizontalScroll: {
    marginBottom: spacing.xs,
  },
  rescheduleDateCard: {
    width: 72,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    marginRight: spacing.xs + 2,
  },
  rescheduleDateCardSel: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rescheduleDayName: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  rescheduleDayNameSel: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  rescheduleDateNum: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  rescheduleDateNumSel: {
    color: colors.white,
  },
  timeSlotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  rescheduleTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rescheduleTimeChipSel: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rescheduleTimeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  rescheduleTimeTextSel: {
    color: colors.white,
  },
  rescheduleSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  rescheduleSummaryText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.primaryDark,
  },
  paymentDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
  },
  paymentDetailLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  paymentDetailValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  paymentTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  paymentTotalLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  paymentTotalValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.sm,
  },
  breakdownSectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  breakdownSubText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
});