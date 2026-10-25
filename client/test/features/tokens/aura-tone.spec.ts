import { describe, expect, it } from 'vitest';
import { auraToneCss, naturalToneCss } from '@/features/tokens/aura-tone';
import { fireAura, goldAura, runeAura } from '../../support/aura-fixtures';

describe('auraToneCss', () => {
  it('a gold tint is the gold of the palette', () => {
    expect(auraToneCss(goldAura())).toBe('#c5a46d');
  });

  it('a natural fire is the natural tone of the fire', () => {
    expect(auraToneCss(fireAura())).toBe('#ff7a2a');
  });

  it('a fire tinted steel is the steel of the palette', () => {
    expect(auraToneCss(fireAura({ color: 'steel' }))).toBe('#8a9bb8');
  });

  it('an image aura has no tone of its own', () => {
    expect(auraToneCss(runeAura())).toBeNull();
  });
});

describe('naturalToneCss', () => {
  it('the shadow is drawn dark, padded to six digits', () => {
    expect(naturalToneCss('shadow')).toBe('#1c1426');
  });
});
