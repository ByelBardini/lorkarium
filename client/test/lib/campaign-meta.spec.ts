import { describe, expect, it } from 'vitest';
import { campaignMeta, memberCountLabel, ROLE_LABEL } from '@/lib/campaign-meta';
import { ANA } from '../support/auth-api-fake';
import { PUBLIC_VHARN, QUELM, VHARN } from '../support/campaigns-api-fake';
import { BIA_AT_TABLE } from '../support/table-session-fixtures';

describe('campaignMeta', () => {
  it('Ana the owner sees system and members, without naming herself nor the status', () => {
    expect(campaignMeta(VHARN, ANA.id)).toBe('D&D 5e · 3 participantes');
  });

  it('a player sees who masters it', () => {
    expect(campaignMeta(QUELM, ANA.id)).toBe('Tormenta20 · Mestre: Bia · 4 participantes');
  });

  it('a spectator also sees who masters it', () => {
    const watched = { ...QUELM, myRole: 'spectator' as const };
    expect(campaignMeta(watched, ANA.id)).toBe('Tormenta20 · Mestre: Bia · 4 participantes');
  });

  it('Bia the co-master (a master, not the owner) still sees "Mestre: Ana"', () => {
    expect(campaignMeta(VHARN, BIA_AT_TABLE.userId)).toBe('D&D 5e · Mestre: Ana · 3 participantes');
  });

  it('someone outside the campaign (no reader) sees who masters it', () => {
    expect(campaignMeta(PUBLIC_VHARN, null)).toBe('D&D 5e · Mestre: Bia · 3 participantes');
  });
});

describe('ROLE_LABEL', () => {
  it('names the spectator "Espectador"', () => {
    expect(ROLE_LABEL.spectator).toBe('Espectador');
  });
});

describe('memberCountLabel', () => {
  it.each([
    [1, '1 participante'],
    [2, '2 participantes'],
  ])('%i reads "%s"', (count, label) => {
    expect(memberCountLabel(count)).toBe(label);
  });
});
