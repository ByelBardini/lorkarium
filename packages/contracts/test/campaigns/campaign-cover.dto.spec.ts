import { describe, expect, it } from 'vitest';
import { campaignCoverDto } from '../../src/campaigns/campaign-cover.dto';

const ASSET_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';

function issuePathsOf(input: unknown): string[] {
  const result = campaignCoverDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('campaignCoverDto', () => {
  it.each([
    [0, 1],
    [2, 4],
  ])('accepts the drawn cover of drawing %i and tone %i', (drawing, tone) => {
    expect(issuePathsOf({ kind: 'drawn', drawing, tone })).toEqual([]);
  });

  it('refuses drawing 3, past the three drawings, on the drawing path', () => {
    expect(issuePathsOf({ kind: 'drawn', drawing: 3, tone: 1 })).toEqual(['drawing']);
  });

  it('refuses tone 0, before the first tone, on the tone path', () => {
    expect(issuePathsOf({ kind: 'drawn', drawing: 0, tone: 0 })).toEqual(['tone']);
  });

  it.each([1, 2, 3, 4])('accepts the chart tone %i', (tone) => {
    expect(campaignCoverDto.parse({ kind: 'drawn', drawing: 0, tone })).toMatchObject({ tone });
  });

  it('accepts a custom tone, normalizing it to lowercase', () => {
    expect(campaignCoverDto.parse({ kind: 'drawn', drawing: 0, tone: '#336699' })).toMatchObject({
      tone: '#336699',
    });
    expect(campaignCoverDto.parse({ kind: 'drawn', drawing: 0, tone: '#ABCDEF' })).toMatchObject({
      tone: '#abcdef',
    });
  });

  it.each([[0], [5], [1.5], ['red'], ['3'], ['#fff'], ['url(x)'], ['#336699;x'], [null]])(
    'refuses the tone %j on the tone path',
    (tone) => {
      expect(issuePathsOf({ kind: 'drawn', drawing: 0, tone })).toEqual(['tone']);
    },
  );

  it('refuses a fractional drawing', () => {
    expect(issuePathsOf({ kind: 'drawn', drawing: 1.5, tone: 1 })).toEqual(['drawing']);
  });

  it('accepts an image cover by asset id', () => {
    expect(campaignCoverDto.parse({ kind: 'image', assetId: ASSET_ID })).toEqual({
      kind: 'image',
      assetId: ASSET_ID,
    });
  });

  it('refuses an image cover whose asset id is not a uuid', () => {
    expect(issuePathsOf({ kind: 'image', assetId: 'capa.png' })).toEqual(['assetId']);
  });

  it('refuses an unknown kind', () => {
    expect(issuePathsOf({ kind: 'video', assetId: ASSET_ID })).toEqual(['kind']);
  });
});
