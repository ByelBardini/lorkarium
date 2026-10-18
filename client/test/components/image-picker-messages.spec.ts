import { describe, expect, it } from 'vitest';
import { imageFailureMessage } from '@/components/image-picker-messages';

describe('imageFailureMessage', () => {
  it.each([
    ['too_large', 'A imagem passa de 20 MB.'],
    ['unsupported', 'Use PNG, JPEG ou WebP.'],
    ['link_unreachable', 'Não deu para baixar esse link. Confira o endereço.'],
    ['invalid', 'Use um link que comece com http:// ou https://.'],
    ['unauthenticated', 'Sua sessão terminou. Entre de novo.'],
  ] as const)('%s reads "%s"', (kind, message) => {
    expect(imageFailureMessage({ kind })).toBe(message);
  });

  it('rate_limited tells how many seconds to wait', () => {
    expect(imageFailureMessage({ kind: 'rate_limited', retryAfterSeconds: 3 })).toBe(
      'Muitos envios seguidos. Espere 3 s.',
    );
  });
});
