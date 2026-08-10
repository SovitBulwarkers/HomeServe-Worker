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
import { JobsAPI, Job } from '../../src/api/endpoints';

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
  const [startOtpDigits, setStartOtpDigits] = useState(['', '', '', '']);
  const [startError, setStartError] = useState('');
  const otpInputs = useRef<Array<TextInput | null>>([]);

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

  const isOverdue =
    ['PENDING', 'ACCEPTED'].includes(job.status) &&
    job.scheduledDate &&
    new Date(job.scheduledDate).getTime() < Date.now();

  const isAccepted = job.status === 'ACCEPTED';
  const serviceName = job.items?.[0]?.service?.name ?? 'Service Request';
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
              Overdue — this job was scheduled for {new Date(job.scheduledDate!).toLocaleString()}. Please complete or contact customer.
            </Text>
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
            Scheduled: {job.scheduledDate ? new Date(job.scheduledDate).toLocaleString() : 'ASAP'}
          </Text>
        </Card>

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

      {/* Missing After Photo Modal Prompt */}
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
                setPickerModalStage('after');
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

      {/* Clean & Simple Complete Job Modal */}
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
                runAction(() => JobsAPI.complete(job.id), 'Job marked complete. Great job!');
              }}
              style={styles.confirmBtn}
            />

            <Pressable style={styles.simpleCancelBtn} onPress={() => setCompleteModalVisible(false)}>
              <Text style={styles.simpleCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  footer: { padding: spacing.xxl, borderTopWidth: 1, borderTopColor: colors.borderLight, backgroundColor: colors.surface },
});