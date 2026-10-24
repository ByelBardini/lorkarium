import { describe, expect, it } from 'vitest';
import { campaignMeta, memberCountLabel, ROLE_LABEL } from '@/lib/campaign-meta';
import { QUELM, VHARN } from '../support/campaigns-api-fake';

describe('campaignMeta', () => {
  it('the master sees system and members, without naming themselves nor the status', () => {
    expect(campaignMeta(VHARN)).toBe('D&D 5e · 3 participantes');
  });

  it('a player sees who masters it', () => {
    expect(campaignMeta(QUELM)).toBe('Tormenta20 · mestre: Bia · 4 participantes');
  });

  it('a spectator also sees who masters it', () => {
    const watched = { ...QUELM, myRole: 'spectator' as const };
    expect(campaignMeta(watched)).toBe('Tormenta20 · mestre: Bia · 4 participantes');
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
