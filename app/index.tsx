import { Redirect } from 'expo-router';
import { useSessionStore } from '@/store/useSessionStore';
export default function Index() { return <Redirect href={useSessionStore.getState().accessToken ? '/(tabs)' : '/auth'} />; }
