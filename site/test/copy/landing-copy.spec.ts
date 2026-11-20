import { describe, expect, it } from 'vitest';
import { type ActId, actById, inviteMailto, landingCopy } from '@/copy/landing-copy';
import { REPOSITORY_URL } from '@/lib/desktop-release';

describe('inviteMailto', () => {
  it('fills the invite subject, URL-encoded', () => {
    expect(inviteMailto('contato@lorkarium.com.br')).toBe(
      'mailto:contato@lorkarium.com.br?subject=Convite%20para%20o%20Lorkarium',
    );
  });
});

function faqAsking(question: string): (typeof landingCopy.faqs)[number] | undefined {
  return landingCopy.faqs.find((faq) => faq.question === question);
}

describe('landingCopy', () => {
  it('says the paid plans are on sale, no longer "não estão à venda"', () => {
    const price = faqAsking('Quanto custa?');

    expect(price?.answer).not.toMatch(/não estão à venda|acesso antecipado/);
    expect(price?.answer).toMatch(/Apoiador, Narrador e Lenda/);
    expect(price?.link?.href).toBe('/planos/');
  });

  it('answers that the Lorkarium is open source under the AGPL, linking the repository', () => {
    const openSource = faqAsking('O Lorkarium é open source?');

    expect(openSource?.answer).toMatch(/AGPL-3\.0/);
    expect(openSource?.link?.href).toBe(REPOSITORY_URL);
  });

  it('promises at most the 8 bars a token takes', () => {
    const barClaims = [...landingCopy.features.map((f) => f.text), ...landingCopy.combatPoints];

    expect(barClaims.some((text) => /quantas barras quiser/i.test(text))).toBe(false);
    expect(barClaims.filter((text) => text.includes('Até 8 barras'))).toHaveLength(2);
  });
});

describe('landingCopy.faqs', () => {
  it('explains the SmartScreen warning as a missing signature, not a virus, shown once', () => {
    const smartScreen = landingCopy.faqs.find((faq) => faq.question.includes('aviso'));

    expect(smartScreen?.answer).toContain('assinatura digital');
    expect(smartScreen?.answer).toContain('não significa que um vírus');
    expect(smartScreen?.answer).toContain('primeira instalação');
    expect(smartScreen?.answer).toContain('Executar assim mesmo');
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
