import { describe, expect, it } from 'vitest';
import {
  createTokensCommandDto,
  deleteTokensCommandDto,
  dragTokensCommandDto,
  moveTokensCommandDto,
  setTokenLayerCommandDto,
  tokensDraggedDto,
} from '../../src/board/token-group.dto';
import { TOKEN_GROUP_MAX } from '../../src/board/token-id-group.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const LYRA_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const BRAM_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const CHEST_ID = '7f6e5d4c-3b2a-4f1e-8d9c-8b7a6f5e4d3c';
const BASE = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID };

function tokenIdNumber(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function idsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => tokenIdNumber(index + 1));
}

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('moveTokensCommandDto', () => {
  it('three distinct tokens with their cells are accepted as sent', () => {
    const command = {
      ...BASE,
      moves: [
        { tokenId: LYRA_ID, col: 2, row: 2 },
        { tokenId: BRAM_ID, col: 3, row: 2 },
        { tokenId: CHEST_ID, col: 5, row: 5 },
      ],
    };

    expect(moveTokensCommandDto.parse(command)).toEqual(command);
  });

  it('a group of one token is accepted', () => {
    const command = { ...BASE, moves: [{ tokenId: LYRA_ID, col: 0, row: 0 }] };

    expect(moveTokensCommandDto.safeParse(command).success).toBe(true);
  });

  it(`a group of ${TOKEN_GROUP_MAX} tokens is accepted`, () => {
    const moves = idsOf(64).map((tokenId) => ({ tokenId, col: 1, row: 1 }));

    expect(moveTokensCommandDto.safeParse({ ...BASE, moves }).success).toBe(true);
  });

  it('a group of 65 tokens is refused', () => {
    const moves = idsOf(65).map((tokenId) => ({ tokenId, col: 1, row: 1 }));

    expect(moveTokensCommandDto.safeParse({ ...BASE, moves }).success).toBe(false);
  });

  it('an empty group is refused', () => {
    expect(moveTokensCommandDto.safeParse({ ...BASE, moves: [] }).success).toBe(false);
  });

  it('the same token twice is refused naming the repeated id', () => {
    const moves = [
      { tokenId: LYRA_ID, col: 1, row: 1 },
      { tokenId: LYRA_ID, col: 2, row: 1 },
    ];

    const result = moveTokensCommandDto.safeParse({ ...BASE, moves });

    expect(messagesOf(result)).toEqual([expect.stringContaining(LYRA_ID)]);
  });

  it('a forged userId is refused (the author comes from the connection)', () => {
    const command = { ...BASE, userId: BRAM_ID, moves: [{ tokenId: LYRA_ID, col: 1, row: 1 }] };

    expect(moveTokensCommandDto.safeParse(command).success).toBe(false);
  });
});

describe('dragTokensCommandDto', () => {
  it('every cell null (the drag ended) is accepted as sent', () => {
    const command = {
      ...BASE,
      drags: [
        { tokenId: LYRA_ID, cell: null },
        { tokenId: BRAM_ID, cell: null },
      ],
    };

    expect(dragTokensCommandDto.parse(command)).toEqual(command);
  });

  it('the same token twice is refused naming the repeated id', () => {
    const drags = [
      { tokenId: BRAM_ID, cell: { col: 1, row: 1 } },
      { tokenId: BRAM_ID, cell: null },
    ];

    const result = dragTokensCommandDto.safeParse({ ...BASE, drags });

    expect(messagesOf(result)).toEqual([expect.stringContaining(BRAM_ID)]);
  });
});

describe('dragTokensCommandDto, edges', () => {
  it('a negative cell is refused', () => {
    const drags = [{ tokenId: LYRA_ID, cell: { col: -1, row: 2 } }];
    expect(dragTokensCommandDto.safeParse({ ...BASE, drags }).success).toBe(false);
  });

  it('a forged userId is refused (the author comes from the connection)', () => {
    const command = { ...BASE, userId: BRAM_ID, drags: [{ tokenId: LYRA_ID, cell: null }] };
    expect(dragTokensCommandDto.safeParse(command).success).toBe(false);
  });
});

describe('tokensDraggedDto', () => {
  it('carries the cells and no version: it is a preview, not a confirmed change', () => {
    const event = {
      campaignId: CAMPAIGN_ID,
      at: '2026-10-16T21:00:00.000Z',
      drags: [{ tokenId: LYRA_ID, cell: { col: 1, row: 1 } }],
    };
    expect(tokensDraggedDto.parse(event)).not.toHaveProperty('version');
    expect(tokensDraggedDto.safeParse({ ...event, version: 3 }).success).toBe(false);
  });
});

describe('setTokenLayerCommandDto', () => {
  it('two tokens moved to the objects layer are accepted as sent', () => {
    const command = { ...BASE, tokenIds: [LYRA_ID, BRAM_ID], layer: 'objects' };

    expect(setTokenLayerCommandDto.parse(command)).toEqual(command);
  });

  it('a layer outside tokens, objects and background is refused', () => {
    const command = { ...BASE, tokenIds: [LYRA_ID], layer: 'gm' };

    expect(setTokenLayerCommandDto.safeParse(command).success).toBe(false);
  });

  it('the same token twice is refused naming the repeated id', () => {
    const command = { ...BASE, tokenIds: [CHEST_ID, LYRA_ID, CHEST_ID], layer: 'background' };

    const result = setTokenLayerCommandDto.safeParse(command);

    expect(messagesOf(result)).toEqual([expect.stringContaining(CHEST_ID)]);
  });

  it('a group of 65 tokens is refused', () => {
    const command = { ...BASE, tokenIds: idsOf(65), layer: 'tokens' };

    expect(setTokenLayerCommandDto.safeParse(command).success).toBe(false);
  });
});

const GOBLIN_WITHOUT_LAYER = {
  name: 'Goblin',
  initials: 'G',
  side: 'enemy',
  width: 1,
  height: 1,
  controllerIds: [],
  col: 3,
  row: 4,
  bars: [
    { label: 'PV', current: 7, max: 7, color: 'ember', visibility: 'everyone', display: 'number' },
  ],
} as const;
const GOBLIN = { ...GOBLIN_WITHOUT_LAYER, layer: 'tokens' } as const;
const PLAIN_LOOK = {
  imageAssetId: null,
  frame: 'square',
  flipX: false,
  flipY: false,
  facing: 0,
  aura: null,
};

function tokensOf(count: number) {
  return Array.from({ length: count }, () => GOBLIN);
}

describe('createTokensCommandDto', () => {
  it('two tokens shaped like token:create without actionId and campaignId are accepted', () => {
    const parsed = createTokensCommandDto.parse({ ...BASE, tokens: tokensOf(2) });

    expect(parsed.tokens).toEqual([
      { ...GOBLIN, ...PLAIN_LOOK, sightAngle: 360, hidden: false },
      { ...GOBLIN, ...PLAIN_LOOK, sightAngle: 360, hidden: false },
    ]);
  });

  it('a token sent without appearance has no image, a square frame, no flip and looks right (facing 0)', () => {
    const parsed = createTokensCommandDto.parse({ ...BASE, tokens: [GOBLIN] });

    expect(parsed.tokens[0]).toMatchObject(PLAIN_LOOK);
  });

  it('a copied token keeps its image, frame, flips and facing', () => {
    const look = { imageAssetId: CHEST_ID, frame: 'round', flipX: true, flipY: true, facing: 135 };
    const parsed = createTokensCommandDto.parse({ ...BASE, tokens: [{ ...GOBLIN, ...look }] });

    expect(parsed.tokens[0]).toMatchObject(look);
  });

  it('a pasted token may name the combat entry of its original', () => {
    const parsed = createTokensCommandDto.parse({
      ...BASE,
      tokens: [{ ...GOBLIN, combatantId: BRAM_ID }],
    });

    expect(parsed.tokens[0]?.combatantId).toBe(BRAM_ID);
  });

  it('a pasted token with a combatantId that is not a uuid is refused', () => {
    const tokens = [{ ...GOBLIN, combatantId: 'inimigos' }];

    expect(createTokensCommandDto.safeParse({ ...BASE, tokens }).success).toBe(false);
  });

  it('a token sent without a layer lands on tokens, as in token:create', () => {
    const parsed = createTokensCommandDto.parse({ ...BASE, tokens: [GOBLIN_WITHOUT_LAYER] });

    expect(parsed.tokens[0]?.layer).toBe('tokens');
  });

  it(`${TOKEN_GROUP_MAX} tokens are accepted and 65 refused`, () => {
    expect(createTokensCommandDto.safeParse({ ...BASE, tokens: tokensOf(64) }).success).toBe(true);
    expect(createTokensCommandDto.safeParse({ ...BASE, tokens: tokensOf(65) }).success).toBe(false);
  });

  it('a token carrying its own actionId is refused (strict item)', () => {
    const tokens = [{ ...GOBLIN, actionId: ACTION_ID }];

    expect(createTokensCommandDto.safeParse({ ...BASE, tokens }).success).toBe(false);
  });
});

describe('deleteTokensCommandDto', () => {
  it('ids with the cell each token must still be on (undo) are accepted as sent', () => {
    const command = {
      ...BASE,
      tokenIds: [LYRA_ID, BRAM_ID],
      expect: [{ tokenId: LYRA_ID, col: 4, row: 4 }],
    };

    expect(deleteTokensCommandDto.parse(command)).toEqual(command);
  });

  it('an expected cell of a token not being deleted is refused naming its id', () => {
    const command = {
      ...BASE,
      tokenIds: [LYRA_ID],
      expect: [{ tokenId: CHEST_ID, col: 1, row: 1 }],
    };

    const result = deleteTokensCommandDto.safeParse(command);

    expect(messagesOf(result)).toEqual([
      expect.stringContaining(`token ${CHEST_ID} is not being deleted`),
    ]);
  });

  it('an expected cell with a negative column is refused', () => {
    const command = {
      ...BASE,
      tokenIds: [LYRA_ID],
      expect: [{ tokenId: LYRA_ID, col: -1, row: 1 }],
    };

    expect(deleteTokensCommandDto.safeParse(command).success).toBe(false);
  });
});

describe('moveTokensCommandDto, undo precondition', () => {
  it('a move with the expected cell of the token is accepted as sent', () => {
    const command = {
      ...BASE,
      moves: [{ tokenId: LYRA_ID, col: 4, row: 4, expect: { col: 6, row: 4 } }],
    };

    expect(moveTokensCommandDto.parse(command)).toEqual(command);
  });

  it('an expected cell with a negative column is refused', () => {
    const moves = [{ tokenId: LYRA_ID, col: 4, row: 4, expect: { col: -1, row: 4 } }];

    expect(moveTokensCommandDto.safeParse({ ...BASE, moves }).success).toBe(false);
  });
});

describe('moveTokensCommandDto path', () => {
  const bends = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ col: i % 10, row: 1 }));

  it('a move carrying its bends is accepted as sent', () => {
    const command = { ...BASE, moves: [{ tokenId: LYRA_ID, col: 4, row: 4, path: bends(2) }] };
    expect(moveTokensCommandDto.parse(command)).toEqual(command);
  });

  it('a path of 33 bends is refused citing 33 and 32', () => {
    const command = { ...BASE, moves: [{ tokenId: LYRA_ID, col: 4, row: 4, path: bends(33) }] };
    expect(messagesOf(moveTokensCommandDto.safeParse(command))).toContain(
      'path has 33 bends; expected at most 32',
    );
  });

  it('a bend at col -1 is refused', () => {
    const path = [{ col: -1, row: 0 }];
    const command = { ...BASE, moves: [{ tokenId: LYRA_ID, col: 4, row: 4, path }] };
    expect(moveTokensCommandDto.safeParse(command).success).toBe(false);
  });
});
