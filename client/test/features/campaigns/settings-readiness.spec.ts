import { describe, expect, it } from 'vitest';
import { readinessOf, type ReadinessValues } from '@/features/campaigns/settings-readiness';

const READY: ReadinessValues = {
  name: 'Vharn',
  description: 'Uma campanha de exploração no norte gelado.',
  cover: { kind: 'image', assetId: '00000000-0000-4000-8000-000000000001' },
  tags: ['Exploração', 'Roleplay'],
};

function doneOf(values: ReadinessValues, key: string): boolean | undefined {
  return readinessOf(values).find((item) => item.key === key)?.done;
}

describe('readinessOf', () => {
  it('lists name, description, cover image and tags, in that order', () => {
    expect(readinessOf(READY).map((item) => item.key)).toEqual([
      'name',
      'description',
      'coverImage',
      'tags',
    ]);
  });

  it('a campaign with everything filled is ready on every item', () => {
    expect(readinessOf(READY).every((item) => item.done)).toBe(true);
  });

  it.each(['', '   '])('a blank name (%j) is not ready', (name) => {
    expect(doneOf({ ...READY, name }, 'name')).toBe(false);
  });

  it('a description of 19 characters after trimming is not ready yet', () => {
    expect(doneOf({ ...READY, description: `  ${'a'.repeat(19)}  ` }, 'description')).toBe(false);
  });

  it('a description of 20 characters is ready', () => {
    expect(doneOf({ ...READY, description: 'a'.repeat(20) }, 'description')).toBe(true);
  });

  it('a drawn cover does not count as a cover image', () => {
    const cover = { kind: 'drawn', drawing: 1, tone: 2 } as const;
    expect(doneOf({ ...READY, cover }, 'coverImage')).toBe(false);
  });

  it('one tag is not enough; two are', () => {
    expect(doneOf({ ...READY, tags: ['Roleplay'] }, 'tags')).toBe(false);
    expect(doneOf({ ...READY, tags: ['Roleplay', 'Sandbox'] }, 'tags')).toBe(true);
  });

  it('each item points at the section where it is fixed', () => {
    const sections = Object.fromEntries(readinessOf(READY).map((i) => [i.key, i.section]));
    expect(sections).toEqual({
      name: 'general',
      description: 'general',
      coverImage: 'images',
      tags: 'content',
    });
  });
});
