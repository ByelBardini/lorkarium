import { describe, expect, it } from 'vitest';
import { assertPublishable } from '@/lib/legal-doc';

describe('assertPublishable', () => {
  it('refuses a draft when drafts are not allowed, naming the file and "draft: true"', () => {
    const publish = (): void => assertPublishable({ id: 'termos', draft: true }, false);

    expect(publish).toThrow(/termos\.md.*draft: true/);
  });

  it('lets a draft through when drafts are allowed', () => {
    expect(() => assertPublishable({ id: 'termos', draft: true }, true)).not.toThrow();
  });

  it('lets a final document through even when drafts are not allowed', () => {
    expect(() => assertPublishable({ id: 'privacidade', draft: false }, false)).not.toThrow();
  });
});
