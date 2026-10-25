import { describe, expect, it } from 'vitest';
import { inviteMailto, landingCopy } from '@/copy/landing-copy';

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
