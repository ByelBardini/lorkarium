import { describe, expect, it } from 'vitest';
import {
  faceTokensCommandDto,
  restyleTokensCommandDto,
  tokensRestyledDto,
} from '../../src/board/token-appearance.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const LYRA_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const ASSET_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const BASE = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID };

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('faceTokensCommandDto', () => {
  it('a turn with the facing the token must still have (undo) is accepted as sent', () => {
    const command = { ...BASE, faces: [{ tokenId: LYRA_ID, facing: 45, expect: { facing: 90 } }] };

    expect(faceTokensCommandDto.parse(command)).toEqual(command);
  });

  it.each([0, 359])('facing %s is accepted', (facing) => {
    const command = { ...BASE, faces: [{ tokenId: LYRA_ID, facing }] };

    expect(faceTokensCommandDto.safeParse(command).success).toBe(true);
  });

  it.each([360, 12.5, -1])('facing %s is refused citing the value', (facing) => {
    const command = { ...BASE, faces: [{ tokenId: LYRA_ID, facing }] };

    expect(messagesOf(faceTokensCommandDto.safeParse(command))).toEqual([
      expect.stringMatching(new RegExp(`${facing}.*0 to 359`)),
    ]);
  });

  it('the same token twice is refused citing its id', () => {
    const faces = [
      { tokenId: LYRA_ID, facing: 0 },
      { tokenId: LYRA_ID, facing: 90 },
    ];

    expect(messagesOf(faceTokensCommandDto.safeParse({ ...BASE, faces }))).toEqual([
      expect.stringContaining(LYRA_ID),
    ]);
  });
});

describe('restyleTokensCommandDto', () => {
  it('a partial style with one field is accepted as sent', () => {
    const command = { ...BASE, tokenIds: [LYRA_ID], style: { flipX: true } };

    expect(restyleTokensCommandDto.parse(command)).toEqual(command);
  });

  it('marking the tokens as defeated is a style of its own', () => {
    const command = { ...BASE, tokenIds: [LYRA_ID], style: { defeated: true } };

    expect(restyleTokensCommandDto.parse(command).style).toEqual({ defeated: true });
  });

  it('the empty style refusal names defeated among the fields', () => {
    const command = { ...BASE, tokenIds: [LYRA_ID], style: {} };

    expect(messagesOf(restyleTokensCommandDto.safeParse(command))).toEqual([
      expect.stringMatching(/defeated/),
    ]);
  });

  it('putting out the light of the tokens is a style of its own', () => {
    const command = { ...BASE, tokenIds: [LYRA_ID], style: { lightLit: false } };

    expect(restyleTokensCommandDto.parse(command).style).toEqual({ lightLit: false });
  });

  it('the empty style refusal names lightLit among the fields', () => {
    const command = { ...BASE, tokenIds: [LYRA_ID], style: {} };

    expect(messagesOf(restyleTokensCommandDto.safeParse(command))).toEqual([
      expect.stringMatching(/lightLit/),
    ]);
  });

  it('a lightLit that is not a boolean is refused', () => {
    const command = { ...BASE, tokenIds: [LYRA_ID], style: { lightLit: 'yes' } };

    expect(restyleTokensCommandDto.safeParse(command).success).toBe(false);
  });

  it('a null image takes the image away', () => {
    const command = { ...BASE, tokenIds: [LYRA_ID], style: { imageAssetId: null } };

    expect(restyleTokensCommandDto.parse(command).style).toEqual({ imageAssetId: null });
  });

  it('an empty style is refused saying it is empty', () => {
    const command = { ...BASE, tokenIds: [LYRA_ID], style: {} };

    expect(messagesOf(restyleTokensCommandDto.safeParse(command))).toEqual([
      expect.stringMatching(/style is empty/),
    ]);
  });

  it('a frame other than square or round is refused', () => {
    const command = { ...BASE, tokenIds: [LYRA_ID], style: { frame: 'hexagon' } };

    expect(restyleTokensCommandDto.safeParse(command).success).toBe(false);
  });

  it('an image and a frame together are accepted', () => {
    const style = { imageAssetId: ASSET_ID, frame: 'round' };

    expect(restyleTokensCommandDto.parse({ ...BASE, tokenIds: [LYRA_ID], style }).style).toEqual(
      style,
    );
  });
});

describe('tokensRestyledDto', () => {
  it('the event carries the same partial style the command had', () => {
    const event = {
      campaignId: CAMPAIGN_ID,
      version: 4,
      at: '2026-10-17T12:00:00.000Z',
      tokenIds: [LYRA_ID],
      style: { flipY: true },
    };

    expect(tokensRestyledDto.parse(event)).toEqual(event);
  });
});
