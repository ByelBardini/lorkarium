import type { UIMatch } from 'react-router';
import { describe, expect, it } from 'vitest';
import { COMPACT_RAIL_HANDLE } from '@/app/shell/rail-handle';
import { placeOf } from '@/app/title-bar/title-bar-place';

function matchWith(handle: unknown): UIMatch {
  return { id: 'route', pathname: '/', params: {}, loaderData: undefined, handle };
}

describe('placeOf', () => {
  it('the deepest route with a place wins', () => {
    const matches = [matchWith({ place: 'Mesa' }), matchWith({ place: 'Configurações da mesa' })];

    expect(placeOf(matches)).toBe('Configurações da mesa');
  });

  it('a deeper route without a place keeps the parent’s', () => {
    expect(placeOf([matchWith({ place: 'Suas mesas' }), matchWith(undefined)])).toBe('Suas mesas');
  });

  it('no route with a place → null', () => {
    expect(placeOf([matchWith(undefined), matchWith(null)])).toBeNull();
  });

  it('a handle of another shape (the compact rail) is ignored', () => {
    expect(placeOf([matchWith(COMPACT_RAIL_HANDLE)])).toBeNull();
  });

  it('the compact rail and a place share one handle', () => {
    expect(placeOf([matchWith({ ...COMPACT_RAIL_HANDLE, place: 'Mesa' })])).toBe('Mesa');
  });
});
