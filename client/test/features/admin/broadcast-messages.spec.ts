import { describe, expect, it } from 'vitest';
import { broadcastFailureMessage, contentCheckOf } from '@/features/admin/broadcast-messages';
import { EMPTY_BROADCAST } from '@/features/admin/use-broadcast-editor';

const WRITTEN = {
  ...EMPTY_BROADCAST,
  choice: 'plan:lenda' as const,
  subject: ' Preços ',
  title: 'Novos preços',
  text: 'Um.\n\nDois.',
};

describe('contentCheckOf', () => {
  it('the fields become the content: the segment, the trimmed texts and the paragraphs', () => {
    expect(contentCheckOf(WRITTEN)).toEqual({
      ok: true,
      content: {
        segment: { plan: 'lenda' },
        subject: 'Preços',
        title: 'Novos preços',
        paragraphs: ['Um.', 'Dois.'],
      },
    });
  });

  it('a button with neither text nor link is no button', () => {
    const check = contentCheckOf({ ...WRITTEN, buttonLabel: ' ', buttonHref: '' });
    expect(check.ok && 'button' in check.content).toBe(false);
  });

  it('a link that is not https says so', () => {
    const check = contentCheckOf({ ...WRITTEN, buttonLabel: 'Ver', buttonHref: 'http://x.com' });
    expect(check).toEqual({ ok: false, message: 'O link do botão precisa começar com https://.' });
  });

  it('a text with only blank lines asks for the paragraphs', () => {
    const check = contentCheckOf({ ...WRITTEN, text: '\n\n  \n' });
    expect(check).toEqual({
      ok: false,
      message: 'Escreva de 1 a 20 parágrafos, separados por uma linha em branco.',
    });
  });
});

describe('broadcastFailureMessage', () => {
  it('a rate limit says how long to wait', () => {
    expect(broadcastFailureMessage({ kind: 'rate_limited', retryAfterSeconds: 42 })).toBe(
      'Muitos testes seguidos. Tente de novo em 42 s.',
    );
  });

  it('2FA missing names the verification in two steps', () => {
    expect(broadcastFailureMessage({ kind: 'two_factor_required' })).toContain(
      'verificação em duas etapas',
    );
  });
});
