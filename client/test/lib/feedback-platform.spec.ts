import { describe, expect, it } from 'vitest';
import { feedbackWhereOf } from '@/lib/feedback-platform';

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

describe('feedbackWhereOf', () => {
  it('the desktop shell is the Windows app with its version', () => {
    expect(feedbackWhereOf(`${CHROME} Edg/142.0.0.0 LorkariumDesktop/0.3.1`)).toEqual({
      platform: 'desktop',
      appVersion: 'Lorkarium 0.3.1',
    });
  });

  it.each([
    [CHROME, 'Chrome 142'],
    [`${CHROME} Edg/141.0.3537.85`, 'Edge 141'],
    [`${CHROME} OPR/120.0.0.0`, 'Opera 120'],
    ['Mozilla/5.0 (Windows NT 10.0; rv:145.0) Gecko/20100101 Firefox/145.0', 'Firefox 145'],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15',
      'Safari 18',
    ],
  ])('a browser reads its name and major version', (userAgent, appVersion) => {
    expect(feedbackWhereOf(userAgent)).toEqual({ platform: 'browser', appVersion });
  });

  it('an unknown browser reads just "Navegador"', () => {
    expect(feedbackWhereOf('curl/8.0')).toEqual({ platform: 'browser', appVersion: 'Navegador' });
  });
});
