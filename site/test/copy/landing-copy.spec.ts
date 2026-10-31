import { describe, expect, it } from 'vitest';
import { type ActId, actById, inviteMailto, landingCopy } from '@/copy/landing-copy';

describe('inviteMailto', () => {
  it('fills the invite subject, URL-encoded', () => {
    expect(inviteMailto('contato@lorkarium.com.br')).toBe(
      'mailto:contato@lorkarium.com.br?subject=Convite%20para%20o%20Lorkarium',
    );
  });
});

describe('landingCopy', () => {
  it('promises at most the 8 bars a token takes', () => {
    const barClaims = [...landingCopy.features.map((f) => f.text), ...landingCopy.combatPoints];

    expect(barClaims.some((text) => /quantas barras quiser/i.test(text))).toBe(false);
    expect(barClaims.filter((text) => text.includes('Até 8 barras'))).toHaveLength(2);
  });
});

describe('landingCopy.acts', () => {
  it('tells the session in six acts, in order, numbered I to VI', () => {
    expect(landingCopy.acts.map((act) => act.id)).toEqual([
      'cena',
      'grupo',
      'iniciativa',
      'combate',
      'dados',
      'chat',
    ]);
    expect(landingCopy.acts.map((act) => act.numeral)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI']);
  });

  it('places each feature in exactly one act', () => {
    const placed = landingCopy.acts.flatMap((act) => act.featureIndexes).sort((a, b) => a - b);

    expect(placed).toEqual(landingCopy.features.map((_, index) => index));
  });

  it('finds an act by its anchor', () => {
    expect(actById('iniciativa').title).toBe('Role a iniciativa');
  });

  it('refuses an unknown act naming the accepted ids', () => {
    expect(() => actById('recursos' as ActId)).toThrow(/"recursos".*cena, grupo/);
  });

  it('uses act ids that are valid lowercase anchors', () => {
    expect(landingCopy.acts.every((act) => /^[a-z]+$/.test(act.id))).toBe(true);
  });
});

describe('landingCopy.encounter', () => {
  const { combatants } = landingCopy.encounter;

  it('lists five combatants in descending initiative', () => {
    const initiatives = combatants.map((combatant) => combatant.initiative);

    expect(combatants).toHaveLength(5);
    expect(initiatives).toEqual([...initiatives].sort((a, b) => b - a));
  });

  it('never has current hit points above the maximum', () => {
    expect(combatants.every((combatant) => combatant.hp <= combatant.maxHp)).toBe(true);
  });

  it('gives the turn to exactly one combatant', () => {
    expect(combatants.filter((combatant) => combatant.hasTurn)).toHaveLength(1);
  });
});
