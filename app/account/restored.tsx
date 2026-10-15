import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Badge, Cta, Title, deleteStyles } from '@/components/accountDeletion/DeleteParts';
import { customerProfileReady, useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

/** #46 C9: shown once after a sign-in that cancelled a pending deletion (`restored: true`). */
export default function AccountRestoredScreen() {
  const s = useThemedStyles(deleteStyles);
  const c = useColors();

  function goHome() {
    const session = useSessionStore.getState();
    session.setRestoredNotice(null);
    router.replace(customerProfileReady(session) ? '/(tabs)' : '/complete-profile');
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.form}>
          <View style={s.spacer} />
          <Badge icon="refresh-outline" color={c.success} />
          <Title>Welcome back</Title>
          <Text style={s.lead}>Your account is restored, just as you left it.</Text>
          <View style={s.spacer} />
          <Cta label="Go home" onPress={goHome} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
