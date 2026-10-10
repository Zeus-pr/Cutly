import { Redirect } from 'expo-router';

/** Legacy route — mid-day edits live on Shop settings. */
export default function PartnerHoursRedirect() {
  return <Redirect href="/partner/settings" />;
}
