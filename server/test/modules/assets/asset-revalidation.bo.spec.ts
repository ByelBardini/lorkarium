import { describe, expect, it } from 'vitest';
import { assetEtagOf, isRevalidated } from '../../../src/modules/assets/asset-revalidation.bo';

const MAP_ID = '0f4b2c1d-3e5f-4a6b-8c7d-9e0f1a2b3c4d';
const ETAG = `"${MAP_ID}"`;

describe('assetEtagOf', () => {
  it('quotes the id, the one validator an immutable content needs', () => {
    expect(assetEtagOf(MAP_ID)).toBe(ETAG);
  });
});

describe('isRevalidated', () => {
  it('matches the same ETag, alone or in a list', () => {
    expect(isRevalidated(ETAG, ETAG)).toBe(true);
    expect(isRevalidated(`"other", ${ETAG}`, ETAG)).toBe(true);
  });

  it('matches the weak form and the wildcard', () => {
    expect(isRevalidated(`W/${ETAG}`, ETAG)).toBe(true);
    expect(isRevalidated('*', ETAG)).toBe(true);
  });

  it('does not match another ETag, the bare id or an absent header', () => {
    expect(isRevalidated('"other"', ETAG)).toBe(false);
    expect(isRevalidated(MAP_ID, ETAG)).toBe(false);
    expect(isRevalidated(undefined, ETAG)).toBe(false);
  });
});
