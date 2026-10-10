import { describe, expect, it } from 'vitest';
import { claimCategoryId } from '../backend/src/serviceCategoryMeta';

describe('Ops category claim (CJ-71 migrate)', () => {
  it('claims Kids before Hair Essentials', () => {
    expect(claimCategoryId('Kids cut')).toBe('kids');
  });

  it('claims tattoo / piercing lines', () => {
    expect(claimCategoryId('Flash / small tattoo')).toBe('tattoo');
    expect(claimCategoryId('Ear lobe')).toBe('piercing');
  });

  it('falls through to other for unknown names', () => {
    expect(claimCategoryId('Mystery spa package XYZ')).toBe('other');
  });
});
