import { describe, expect, it } from 'vitest';
import {
  assetOutlineResponseDto,
  importAssetRequestDto,
  sightOutlineDto,
  uploadAssetQueryDto,
} from '../../src/assets/asset.dto';

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

function polygonOf(points: number): number[][] {
  return Array.from({ length: points }, (_, at) => [at / points, 0.5]);
}

describe('sightOutlineDto', () => {
  it('accepts a triangle in the unit square, its edges included', () => {
    const triangle = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];

    expect(sightOutlineDto.parse([triangle])).toEqual([triangle]);
  });

  it('accepts the empty list of a fully transparent image', () => {
    expect(sightOutlineDto.parse([])).toEqual([]);
  });

  it('accepts exactly 48 vertices', () => {
    const outline = [polygonOf(24), polygonOf(24)];

    expect(sightOutlineDto.safeParse(outline).success).toBe(true);
  });

  it('refuses 49 vertices in total, across the polygons, citing the count and the limit', () => {
    const result = sightOutlineDto.safeParse([polygonOf(24), polygonOf(25)]);

    expect(result.error?.issues[0]?.message).toMatch(/49 vertices.*48/);
  });

  it('accepts exactly 4 islands', () => {
    const outline = Array.from({ length: 4 }, () => polygonOf(3));

    expect(sightOutlineDto.safeParse(outline).success).toBe(true);
  });

  it('refuses 5 islands', () => {
    const outline = Array.from({ length: 5 }, () => polygonOf(3));

    expect(sightOutlineDto.safeParse(outline).success).toBe(false);
  });

  it('refuses a polygon of 2 points', () => {
    expect(sightOutlineDto.safeParse([polygonOf(2)]).success).toBe(false);
  });

  it.each([
    ['above 1', [1.5, 0]],
    ['below 0', [0, -0.1]],
  ])('refuses a coordinate %s', (_name, point) => {
    const outline = [[point, [0.5, 0.5], [0.2, 0.9]]];

    expect(sightOutlineDto.safeParse(outline).success).toBe(false);
  });

  it('refuses a point with a third coordinate', () => {
    const outline = [
      [
        [0, 0, 0],
        [1, 0],
        [1, 1],
      ],
    ];

    expect(sightOutlineDto.safeParse(outline).success).toBe(false);
  });
});

describe('assetOutlineResponseDto', () => {
  it('accepts a null outline: an image without one', () => {
    expect(assetOutlineResponseDto.parse({ outline: null })).toEqual({ outline: null });
  });

  it('refuses an extra field', () => {
    const body = { outline: null, storageKey: 'assets/x' };

    expect(assetOutlineResponseDto.safeParse(body).success).toBe(false);
  });

  it('refuses a response with an outline above the limits', () => {
    const body = { outline: [polygonOf(49)] };

    expect(assetOutlineResponseDto.safeParse(body).success).toBe(false);
  });
});
