import { describe, expect, it } from 'vitest';
import { grantVerdict, orderVerdict } from '../../../src/modules/badges/badges.bo';

const A = 'a1a1a1a1-0000-4000-8000-000000000001';
const B = 'b2b2b2b2-0000-4000-8000-000000000002';
const C = 'c3c3c3c3-0000-4000-8000-000000000003';

describe('orderVerdict', () => {
  it('the same ids in another order are current', () => {
    expect(orderVerdict([A, B, C], [C, A, B])).toEqual({ kind: 'current' });
  });

  it('the order the catalog already has is current too', () => {
    expect(orderVerdict([A, B], [A, B])).toEqual({ kind: 'current' });
  });

  it('a missing id and an unknown one are stale, naming both', () => {
    expect(orderVerdict([A, B], [A, C])).toEqual({ kind: 'stale', missing: [B], extra: [C] });
  });

  it('a list shorter than the catalog is stale with the missing ids', () => {
    expect(orderVerdict([A, B, C], [B])).toEqual({ kind: 'stale', missing: [A, C], extra: [] });
  });

  it('an empty catalog takes only the empty order', () => {
    expect(orderVerdict([], [])).toEqual({ kind: 'current' });
    expect(orderVerdict([], [A])).toEqual({ kind: 'stale', missing: [], extra: [A] });
  });
});

describe('grantVerdict', () => {
  const catalog = [
    { id: A, hasImage: true },
    { id: B, hasImage: false },
    { id: C, hasImage: true },
  ];

  it('badges that all have an image are grantable, and so is none', () => {
    expect(grantVerdict(catalog, [C, A])).toEqual({ kind: 'grantable' });
    expect(grantVerdict(catalog, [])).toEqual({ kind: 'grantable' });
  });

  it('a badge without an image is refused with its id', () => {
    expect(grantVerdict(catalog, [A, B])).toEqual({ kind: 'without-image', badgeId: B });
  });

  it('an id out of the catalog is unknown, before any image check', () => {
    const unknown = '00000000-0000-4000-8000-000000000000';

    expect(grantVerdict(catalog, [B, unknown])).toEqual({ kind: 'unknown', badgeId: unknown });
  });
});
