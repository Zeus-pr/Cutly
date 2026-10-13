import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBack } from '@/components/ScreenBack';
import { PressScale } from '@/components/PressScale';
import { fontFamily } from '@/constants/fonts';
import { FAQ, type LegalBlock } from '@/constants/legal';
import { radii, spacing, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

export function LegalDocument({ title, blocks }: { title: string; blocks: LegalBlock[] }) {
  const styles = useThemedStyles(legalStyles);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <ScreenBack />
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>Last updated 11 October 2026</Text>
        {blocks.map((block) => (
          <View key={block.heading} style={styles.block}>
            <Text style={styles.heading}>{block.heading}</Text>
            {block.body.map((paragraph) => (
              <Text key={paragraph} style={styles.body}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export function FaqScreen() {
  const colors = useColors();
  const styles = useThemedStyles(legalStyles);
  const [open, setOpen] = useState<string | null>(FAQ[0]?.q ?? null);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <ScreenBack />
        <Text style={styles.headerTitle}>FAQ</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {FAQ.map((item) => {
          const on = open === item.q;
          return (
            <PressScale
              key={item.q}
              style={styles.faq}
              pressedScale={0.99}
              haptic
              onPress={() => setOpen(on ? null : item.q)}
            >
              <View style={styles.faqRow}>
                <Text style={styles.heading}>{item.q}</Text>
                <Ionicons name={on ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
              </View>
              {on ? <Text style={styles.body}>{item.a}</Text> : null}
            </PressScale>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function legalStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontFamily: fontFamily.semibold,
      fontSize: 17,
      color: colors.ink
    },
    headerSpacer: { width: 36 },
    content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.lg },
    updated: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.muted },
    block: { gap: spacing.sm },
    heading: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 16, color: colors.ink },
    body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22, color: colors.muted },
    faq: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      gap: spacing.sm
    },
    faqRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }
  });
}
