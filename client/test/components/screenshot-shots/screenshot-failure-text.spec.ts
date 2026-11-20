import { describe, expect, it } from 'vitest';
import { screenshotFailureText } from '@/components/screenshot-shots/screenshot-failure-text';

describe('screenshotFailureText', () => {
  it.each([
    [{ kind: 'attachment_too_large' }, 'O print passa de 5 MB.'],
    [{ kind: 'unsupported_image' }, 'Esse arquivo não é um PNG, JPEG ou WebP.'],
    [{ kind: 'offline' }, 'Sem conexão. Tente de novo.'],
    [{ kind: 'unexpected' }, 'O print não subiu. Tente de novo.'],
  ] as const)('%o reads %j', (failure, text) => {
    expect(screenshotFailureText(failure)).toBe(text);
  });

  it('too many in a row names the wait in seconds', () => {
    expect(screenshotFailureText({ kind: 'rate_limited', retryAfterSeconds: 12 })).toBe(
      'Muitos prints seguidos. Tente de novo em 12 s.',
    );
  });
});
