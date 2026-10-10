import { Modal, StyleSheet, Text, View } from 'react-native';
import { PressScale } from '@/components/PressScale';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { useDialogStore } from '@/store/useDialogStore';

/** Centered cream/navy/coral confirm — replaces system Alert.alert. */
export function AppDialogHost() {
  const colors = useColors();
  const styles = useThemedStyles(dialogStyles);
  const visible = useDialogStore((s) => s.visible);
  const title = useDialogStore((s) => s.title);
  const message = useDialogStore((s) => s.message);
  const actions = useDialogStore((s) => s.actions);
  const hide = useDialogStore((s) => s.hide);

  function run(actionIndex: number) {
    const action = actions[actionIndex];
    hide();
    action?.onPress?.();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={hide}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            {actions.map((action, index) => {
              const destructive = action.role === 'destructive';
              const primary = action.role === 'confirm' || destructive;
              return (
                <PressScale
                  key={`${action.label}-${index}`}
                  onPress={() => run(index)}
                  style={[
                    styles.btn,
                    primary ? styles.btnPrimary : styles.btnGhost,
                    destructive && styles.btnDanger
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <Text
                    style={[
                      styles.btnText,
                      primary && styles.btnTextPrimary,
                      destructive && styles.btnTextDanger,
                      !primary && { color: colors.ink }
                    ]}
                  >
                    {action.label}
                  </Text>
                </PressScale>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const dialogStyles = (colors: Palette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(23,38,60,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.line
    },
    title: { ...typography.heading, color: colors.ink, fontSize: 18 },
    message: { ...typography.body, color: colors.muted, marginTop: spacing.sm },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },
    btn: {
      minHeight: 40,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center'
    },
    btnGhost: { backgroundColor: colors.sand },
    btnPrimary: { backgroundColor: colors.accent },
    btnDanger: { backgroundColor: colors.danger },
    btnText: { ...typography.caption, fontWeight: '700' },
    btnTextPrimary: { color: colors.white },
    btnTextDanger: { color: colors.white }
  });
