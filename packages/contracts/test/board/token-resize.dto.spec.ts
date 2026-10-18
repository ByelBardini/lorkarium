import { describe, expect, it } from 'vitest';
import { resizeTokensCommandDto } from '../../src/board/token-resize.dto';

const BASE = {
  actionId: '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a',
  campaignId: '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a',
};
const LYRA_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const LYRA_BOX = { tokenId: LYRA_ID, col: 2.5, row: 3, width: 1.5, height: 0.5 };

function messagesOf(input: unknown): string[] {
  const result = resizeTokensCommandDto.safeParse(input);
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('resizeTokensCommandDto', () => {
  it('a half-cell box with the box the undo expects is accepted as sent', () => {
    const command = {
      ...BASE,
      resizes: [{ ...LYRA_BOX, expect: { col: 3, row: 3, width: 1, height: 1 } }],
    };

    expect(resizeTokensCommandDto.parse(command)).toEqual(command);
  });

  it.each([
    ['width', 10.5],
    ['height', 0],
    ['col', 0.75],
  ])('%s %s is refused citing the value', (field, value) => {
    expect(messagesOf({ ...BASE, resizes: [{ ...LYRA_BOX, [field]: value }] })).toEqual([
      expect.stringContaining(`${value} is invalid`),
    ]);
  });

  it('the same token twice is refused citing its id', () => {
    expect(messagesOf({ ...BASE, resizes: [LYRA_BOX, LYRA_BOX] })).toEqual([
      expect.stringContaining(LYRA_ID),
    ]);
  });
});
