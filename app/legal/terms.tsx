import { LegalDocument } from '@/components/LegalDocument';
import { TERMS } from '@/constants/legal';

export default function TermsScreen() {
  return <LegalDocument title="Terms & Conditions" blocks={TERMS} />;
}
