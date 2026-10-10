import { router, useLocalSearchParams } from 'expo-router';
import { appAlert } from '@/store/useDialogStore';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { BackButton } from '@/components/BackButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StarRating } from '@/components/StarRating';
import { type Palette, radii, spacing, typography } from '@/constants/theme';
import { api } from '@/services/api';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

export default function RateVisit() {
  const colors = useColors();
  const styles = useThemedStyles(screenStyles);
  const params = useLocalSearchParams<{
    bookingId: string;
    shopName: string;
    barberName: string;
    shopOnly?: string;
  }>();
  const shopOnly = params.shopOnly === '1' || params.shopOnly === 'true';
  const queryClient = useQueryClient();
  const [shopRating, setShopRating] = useState(0);
  const [barberRating, setBarberRating] = useState(0);
  const [text, setText] = useState('');
  const [working, setWorking] = useState(false);

  const submit = async () => {
    if (working) return;
    if (shopRating < 1) {
      appAlert('Rate the shop', 'Tap stars for the shop.');
      return;
    }
    if (!shopOnly && barberRating < 1) {
      appAlert('Rate both', 'Tap stars for the shop and the staff member.');
      return;
    }
    setWorking(true);
    try {
      await api.createReview(params.bookingId, {
        shopRating,
        // API still stores barberRating — shop-only home prompt mirrors shop stars.
        barberRating: shopOnly ? shopRating : barberRating,
        text: text.trim() || undefined
      });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['shops'] });
      appAlert('Thanks', 'Your review helps others choose a shop.');
      router.back();
    } catch (err) {
      appAlert('Could not save', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackButton label="Rate" />
        <Text style={styles.title}>{shopOnly ? 'How was the shop?' : 'How was it?'}</Text>
        <Text style={styles.sub}>
          {shopOnly
            ? `Rate ${params.shopName || 'the shop'} — your score shows on their listing.`
            : `Rate the shop and ${params.barberName || 'the staff member'} separately — both go on their profiles.`}
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>{params.shopName || 'Shop'}</Text>
          <StarRating value={shopRating} onChange={setShopRating} />
        </View>

        {!shopOnly ? (
          <View style={styles.card}>
            <Text style={styles.label}>{params.barberName || 'Staff'}</Text>
            <StarRating value={barberRating} onChange={setBarberRating} />
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="What should the next guest know?"
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            maxLength={500}
          />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton
          label={working ? 'Saving…' : 'Submit review'}
          onPress={() => void submit()}
          disabled={working}
        />
      </View>
    </SafeAreaView>
  );
}

function screenStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },
    title: { ...typography.display, color: colors.ink },
    sub: { ...typography.body, color: colors.muted, marginBottom: spacing.sm },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      gap: spacing.sm
    },
    label: { ...typography.heading, color: colors.ink },
    input: {
      minHeight: 96,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      color: colors.ink,
      ...typography.body,
      textAlignVertical: 'top'
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: spacing.lg,
      backgroundColor: colors.canvas,
      borderTopWidth: 1,
      borderTopColor: colors.line
    }
  });
}
