import { describe, expect, it } from 'vitest';
import { guideSchema } from '@/lib/guide-schema';
import { guideEntry } from '../support/guide-factory';

const VALID = guideEntry('recursos/dados-3d', {
  draft: true,
  related: ['recursos/grid-de-combate'],
  faqs: [{ question: 'Precisa de ficha pronta?', answer: 'Não.' }],
}).data;

describe('the guides schema', () => {
  it('accepts a guide with related links and its own FAQ', () => {
    expect(guideSchema.parse(VALID)).toEqual(VALID);
  });

  it('defaults related to none', () => {
    const withoutRelated: Partial<typeof VALID> = { ...VALID };
    delete withoutRelated.related;

    expect(guideSchema.parse(withoutRelated).related).toEqual([]);
  });

  it('refuses an unknown kind, citing it and the accepted ones', () => {
    const result = guideSchema.safeParse({ ...VALID, kind: 'blog' });

    expect(result.error?.issues[0]?.message).toBe('kind is "blog"; expected recurso');
  });

  it('refuses a field it does not know (strict)', () => {
    expect(guideSchema.safeParse({ ...VALID, autor: 'Claude' }).success).toBe(false);
  });

  it('refuses a title too long for the result and a short description', () => {
    expect(guideSchema.safeParse({ ...VALID, title: 'x'.repeat(61) }).success).toBe(false);
    expect(guideSchema.safeParse({ ...VALID, description: 'curta' }).success).toBe(false);
  });

  it('refuses a date that is not YYYY-MM-DD', () => {
    expect(guideSchema.safeParse({ ...VALID, updatedAt: '20/11/2026' }).success).toBe(false);
  });
});
