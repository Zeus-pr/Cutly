import { LegalDocument } from '@/components/LegalDocument';
import { PRIVACY } from '@/constants/legal';

export default function PrivacyScreen() {
  return <LegalDocument title="Privacy Policy" blocks={PRIVACY} />;
}
