import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, ActivityIndicator, Pressable, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../theme';
import { WalletAPI } from '../api/endpoints';
import Button from './Button';

interface Props {
  visible: boolean;
  owed: number;
  onClose: () => void;
  onSettled: (newBalance: number) => void;
}

function buildCheckoutHtml(opts: {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
}) {
  const { keyId, orderId, amount, currency, name, description } = opts;
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  </head>
  <body style="margin:0;background:#fff;">
    <script>
      function post(payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
      var options = {
        key: "${keyId}",
        amount: "${amount}",
        currency: "${currency}",
        order_id: "${orderId}",
        name: "${name}",
        description: "${description}",
        handler: function (response) {
          post({ type: 'success', response: response });
        },
        modal: {
          ondismiss: function () {
            post({ type: 'dismiss' });
          },
        },
        theme: { color: "${colors.primary}" },
      };
      try {
        var rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
          post({ type: 'failed', response: response });
        });
        rzp.open();
      } catch (e) {
        post({ type: 'error', message: String(e) });
      }
    </script>
  </body>
</html>`;
}

export default function SettleDebtModal({ visible, owed, onClose, onSettled }: Props) {
  const [stage, setStage] = useState<'loading' | 'checkout' | 'verifying' | 'error'>('loading');
  const [html, setHtml] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const start = async () => {
    setStage('loading');
    setErrorMsg('');
    try {
      const { data } = await WalletAPI.createSettleDebtOrder();
      const order = data.data;
      setHtml(
        buildCheckoutHtml({
          keyId: order.keyId,
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: 'HomeServe Pro',
          description: 'Cash commission settlement',
        }),
      );
      setStage('checkout');
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.message || 'Could not start payment. Please try again.');
      setStage('error');
    }
  };

  React.useEffect(() => {
    if (visible) start();
    else {
      setHtml(null);
      setStage('loading');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleMessage = async (event: any) => {
    let payload: any;
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (payload.type === 'dismiss') {
      onClose();
      return;
    }

    if (payload.type === 'failed' || payload.type === 'error') {
      setErrorMsg('Payment could not be completed. Please try again.');
      setStage('error');
      return;
    }

    if (payload.type === 'success') {
      setStage('verifying');
      try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload.response;
        const { data } = await WalletAPI.verifySettleDebt({
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          amount: owed,
        });
        onSettled(data.data.balance);
      } catch (e: any) {
        setErrorMsg(
          e?.response?.data?.message ||
            'Payment succeeded but we could not confirm it. Contact support with your payment ID.',
        );
        setStage('error');
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handleBar} />

          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="wallet-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>Settle Commission</Text>
              <Text style={styles.headerSub}>Amount due: ₹{owed.toFixed(0)}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.body}>
            {stage === 'loading' && (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.loadingText}>Preparing secure checkout for ₹{owed.toFixed(0)}…</Text>
              </View>
            )}

            {stage === 'checkout' && html && (
              <View style={styles.webviewContainer}>
                <WebView
                  originWhitelist={['*']}
                  source={{ html }}
                  onMessage={handleMessage}
                  style={{ flex: 1 }}
                />
              </View>
            )}

            {stage === 'verifying' && (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.loadingText}>Verifying payment receipt…</Text>
              </View>
            )}

            {stage === 'error' && (
              <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={44} color={colors.danger} />
                <Text style={styles.errorText}>{errorMsg}</Text>
                <Button title="Try Again" onPress={start} style={{ marginTop: spacing.lg, width: '100%' }} />
              </View>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  card: {
    height: '75%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxxl : spacing.xxl,
    ...shadow.raised,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  headerSub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  webviewContainer: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
