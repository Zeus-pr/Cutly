import { router, useLocalSearchParams } from 'expo-router';
import { appAlert, appConfirm } from '@/store/useDialogStore';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { BackButton } from '@/components/BackButton';
import { type Palette, spacing, typography } from '@/constants/theme';
import { api } from '@/services/api';
import { notifyAwaitingShop, registerForPushNotifications } from '@/services/notifications';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatINR } from '@/utils/money';

type PayMessage =
  | { ok: true; razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
  | { ok: false; reason?: string };

function checkoutHtml(input: {
  keyId: string;
  orderId: string;
  amountPaise: number;
  description: string;
  shopName: string;
}) {
  const keyId = JSON.stringify(input.keyId);
  const orderId = JSON.stringify(input.orderId);
  const description = JSON.stringify(input.description);
  const shopName = JSON.stringify(input.shopName);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>CUTLY test pay</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #141110; color: #f5f1ea; margin: 0; padding: 24px; }
    p { opacity: 0.75; line-height: 1.4; }
    .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #F06B55; color: #ffffff; font-weight: 700; font-size: 12px; }
  </style>
</head>
<body>
  <div class="badge">RAZORPAY TEST MODE</div>
  <h2>CUTLY advance</h2>
  <p>No real money is charged. Use Razorpay test cards / UPI in the checkout sheet.</p>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    function send(payload) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
    var options = {
      key: ${keyId},
      amount: ${input.amountPaise},
      currency: 'INR',
      name: 'CUTLY',
      description: ${description},
      order_id: ${orderId},
      prefill: {},
      notes: { shop: ${shopName} },
      theme: { color: '#F06B55' },
      modal: {
        ondismiss: function () { send({ ok: false, reason: 'dismissed' }); }
      },
      handler: function (response) {
        send({
          ok: true,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature
        });
      }
    };
    try {
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function () { send({ ok: false, reason: 'failed' }); });
      rzp.open();
    } catch (e) {
      send({ ok: false, reason: 'checkout_error' });
    }
  </script>
</body>
</html>`;
}

export default function RazorpayPay() {
  const colors = useColors();
  const styles = useThemedStyles(screenStyles);
  const params = useLocalSearchParams<{
    bookingId: string;
    keyId: string;
    orderId: string;
    amountPaise: string;
    description: string;
    shopName: string;
    serviceName: string;
    barberName: string;
    startsAt: string;
    total: string;
    advance: string;
  }>();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  /** Sync lock — Razorpay often posts success + dismiss in the same tick. */
  const lock = useRef<'open' | 'paid' | 'dismissed'>('open');

  const html = checkoutHtml({
    keyId: params.keyId || '',
    orderId: params.orderId || '',
    amountPaise: Number(params.amountPaise || 0),
    description: params.description || 'CUTLY test advance',
    shopName: params.shopName || 'CUTLY'
  });

  async function abandon() {
    if (!params.bookingId || lock.current !== 'open') return;
    lock.current = 'dismissed';
    try {
      await api.abandonPayment(params.bookingId);
    } catch {
      // slot free best-effort
    }
    router.back();
  }

  async function onMessage(event: WebViewMessageEvent) {
    let message: PayMessage;
    try {
      message = JSON.parse(event.nativeEvent.data) as PayMessage;
    } catch {
      return;
    }

    // After Razorpay success, modal ondismiss also fires — never abandon a paid booking.
    if (!message.ok) {
      if (lock.current === 'paid') return;
      if (lock.current !== 'open') return;
      await abandon();
      if (message.reason === 'failed') {
        appAlert('Payment failed', 'Test checkout did not complete. Try again.');
      }
      return;
    }

    if (lock.current !== 'open') return;
    lock.current = 'paid';
    setBusy(true);

    try {
      await registerForPushNotifications();
      const booking = await api.confirmPayment(params.bookingId, {
        razorpayOrderId: message.razorpay_order_id,
        razorpayPaymentId: message.razorpay_payment_id,
        razorpaySignature: message.razorpay_signature
      });
      await notifyAwaitingShop({
        shopName: params.shopName || booking.shop.name,
        serviceName: params.serviceName || booking.service.name,
        startsAt: booking.startsAt,
        bookingCode: booking.bookingCode,
        bookingId: booking.id
      });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
      router.replace({ pathname: '/booking/success', params: { id: booking.id } });
    } catch (err) {
      setBusy(false);
      // Money may already be captured in Razorpay test — do not abandon; let user retry confirm.
      appAlert('Could not confirm', err instanceof Error ? err.message : 'Try again.', [
        {
          label: 'Retry',
          role: 'confirm',
          onPress: () => {
            lock.current = 'open';
            void onMessage(event);
          }
        },
        {
          label: 'Back',
          role: 'cancel',
          onPress: () => router.back()
        }
      ]);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <BackButton label="Cancel" onPress={() => void abandon()} accessibilityLabel="Cancel test pay" />
        <Text style={styles.badge}>Razorpay test · {formatINR(Number(params.amountPaise || 0))}</Text>
      </View>
      {busy ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.hint}>Confirming test payment…</Text>
        </View>
      ) : (
        <WebView
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://api.razorpay.com' }}
          onMessage={(e) => void onMessage(e)}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          style={styles.web}
        />
      )}
    </SafeAreaView>
  );
}

function screenStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    top: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: 6 },
    badge: { ...typography.caption, color: colors.accent, fontWeight: '700' },
    web: { flex: 1, backgroundColor: colors.canvas },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
    hint: { ...typography.body, color: colors.muted }
  });
}
