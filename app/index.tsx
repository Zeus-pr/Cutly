import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSessionStore } from '@/store/useSessionStore';

export default function Index() {
  const hydrated = useSessionStore((state) => state.hydrated);
  const accessToken = useSessionStore((state) => state.accessToken);
  useEffect(() => { void useSessionStore.getState().hydrate(); }, []);
  if (!hydrated) return <View style={{ flex: 1, backgroundColor: '#0EC9A5' }} />;
  return <Redirect href={accessToken ? '/(tabs)' : '/auth'} />;
}