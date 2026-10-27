import { describe, expect, it } from 'vitest';
import { readerSeatOf } from '@/lib/campaign-seat';
import { ANA, ROOT_ADMIN } from '../support/auth-api-fake';
import { QUELM, VHARN } from '../support/campaigns-api-fake';

describe('readerSeatOf', () => {
  it('Ana reading her own campaign sits as its owner', () => {
    expect(readerSeatOf(VHARN, ANA.id)).toEqual({ role: 'master', owner: true, juggernaut: false });
  });

  it('a co-master (master, someone else created it) is no owner', () => {
    const coMastered = { ...QUELM, myRole: 'master' as const };

    expect(readerSeatOf(coMastered, ANA.id)).toEqual({
      role: 'master',
      owner: false,
      juggernaut: false,
    });
  });

  it('Root in juggernaut mode sits as a juggernaut master', () => {
    const asJuggernaut = { ...QUELM, myRole: 'master' as const, juggernaut: true };

    expect(readerSeatOf(asJuggernaut, ROOT_ADMIN.id)).toEqual({
      role: 'master',
      owner: false,
      juggernaut: true,
    });
  });

  it('without a reader (the session went away) nobody is the owner', () => {
    expect(readerSeatOf(VHARN, null).owner).toBe(false);
  });
});
