import { describe, expect, it } from 'vitest';
import { importAssetRequestDto, uploadAssetQueryDto } from '../../src/assets/asset.dto';

function messagesOf(input: unknown): string[] {
  const result = importAssetRequestDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

const HOST = 'https://x.com/';

describe('importAssetRequestDto', () => {
  it('trims the link before keeping it', () => {
    const parsed = importAssetRequestDto.parse({ url: ' https://x.com/a.png ', purpose: 'token' });
    expect(parsed.url).toBe('https://x.com/a.png');
  });

  it('accepts a plain http link too', () => {
    expect(messagesOf({ url: 'http://x.com/a.png', purpose: 'background' })).toEqual([]);
  });

  it('accepts a link of exactly 2048 characters', () => {
    const url = HOST + 'a'.repeat(2048 - HOST.length);
    expect(messagesOf({ url, purpose: 'token' })).toEqual([]);
  });

  it('refuses a link of 2049 characters citing the limit', () => {
    const url = HOST + 'a'.repeat(2049 - HOST.length);
    expect(messagesOf({ url, purpose: 'token' })).toEqual([expect.stringMatching(/^url: .*2048/)]);
  });

  it.each([
    ['ftp:', 'ftp://x.com/a.png'],
    ['data:', 'data:image/png;base64,iVBORw0KGgo='],
    ['javascript:', 'javascript:alert(1)'],
  ])('refuses the %s scheme citing it and "http or https"', (scheme, url) => {
    expect(messagesOf({ url, purpose: 'token' })).toEqual([
      expect.stringMatching(new RegExp(`^url: .*${scheme}.*http or https`)),
    ]);
  });

  it('refuses text that is not a link', () => {
    expect(messagesOf({ url: 'a picture of a dragon', purpose: 'token' })).toEqual([
      expect.stringMatching(/^url: /),
    ]);
  });

  it('accepts a link sent for a condition image', () => {
    expect(messagesOf({ url: 'https://x.com/blind.png', purpose: 'condition' })).toEqual([]);
  });

  it('refuses a purpose outside the four the server keeps', () => {
    expect(messagesOf({ url: 'https://x.com/a.png', purpose: 'avatar' })).toEqual([
      expect.stringMatching(/^purpose: /),
    ]);
  });
});

describe('uploadAssetQueryDto', () => {
  it('accepts a file sent for a condition image', () => {
    expect(uploadAssetQueryDto.parse({ purpose: 'condition' })).toEqual({ purpose: 'condition' });
  });

  it('refuses an icon purpose citing the purpose field', () => {
    const result = uploadAssetQueryDto.safeParse({ purpose: 'icon' });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['purpose']);
  });
});
