import { describe, expect, it } from 'vitest';
import { createBucketInput } from '../../../src/infrastructure/asset-storage/s3-asset-storage';

describe('createBucketInput', () => {
  it('leaves the location out in us-east-1, which AWS refuses when named explicitly', () => {
    const input = createBucketInput('lk', 'us-east-1');

    expect(input).toStrictEqual({ Bucket: 'lk' });
    expect(input).not.toHaveProperty('CreateBucketConfiguration');
  });

  it('sends the region as the location constraint in any other region', () => {
    expect(createBucketInput('lk', 'sa-east-1')).toStrictEqual({
      Bucket: 'lk',
      CreateBucketConfiguration: { LocationConstraint: 'sa-east-1' },
    });
  });
});
