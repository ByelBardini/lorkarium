import { describe, expect, it } from 'vitest';
import { boardWithTable, resolveLinkedTokens } from '@/lib/linked-tokens';
import { fireAura, goldAura } from '../support/aura-fixtures';
import { castBoard } from '../support/cast-fixtures';
import {
  LYRA_CHARACTER_ID,
  kaelCharacter,
  linkedLyra,
  lyraCharacter,
} from '../support/character-fixtures';
import { LYRA_FORMS, WOLF_FORM_ID } from '../support/token-form-fixtures';
import {
  BIA_AT_TABLE,
  activeCondition,
  conditionDefinition,
  kael,
  vharnBoard,
} from '../support/table-session-fixtures';

const IMAGE_ID = '7f6e5d4c-3b2a-4f1e-8d9c-0b1a2c3d4e5f';
const TORCH = { bright: 4, dim: 4, color: 'torch' as const, angle: 360 };

describe('resolveLinkedTokens', () => {
  const character = lyraCharacter({
    name: 'Lyra Vandel',
    initials: 'LV',
    side: 'neutral',
    imageAssetId: IMAGE_ID,
    frame: 'round',
    defeated: true,
    conditions: [activeCondition()],
    controllerIds: [BIA_AT_TABLE.userId, 'c0ffee00-0000-4000-8000-000000000001'],
    canControl: false,
    // The size a new token gets: each token keeps its own.
    width: 2,
    height: 2,
  });

  it("a linked token wears its character's identity, look, bars, conditions and control", () => {
    const [token] = resolveLinkedTokens([linkedLyra()], [character]);
    expect(token).toMatchObject({
      name: 'Lyra Vandel',
      initials: 'LV',
      side: 'neutral',
      imageAssetId: IMAGE_ID,
      frame: 'round',
      defeated: true,
      bars: character.bars,
      conditions: character.conditions,
      controllerIds: character.controllerIds,
      canControl: false,
    });
  });

  // Regression (e6a5d36): a linked token kept its snapshot aura until the table was entered
  // again.
  it("a linked token wears its character's aura, and the character's new aura replaces the old one", () => {
    const own = linkedLyra({ aura: goldAura() });
    const [token] = resolveLinkedTokens([own], [lyraCharacter({ aura: fireAura({ radius: 3 }) })]);
    expect(token?.aura).toEqual(fireAura({ radius: 3 }));
  });

  it("a linked token loses its aura when its character's aura is taken away", () => {
    const [token] = resolveLinkedTokens([linkedLyra({ aura: goldAura() })], [lyraCharacter()]);
    expect(token?.aura).toBeNull();
  });

  it('keeps its own place, size, layer, facing, flips, forms, sight and light', () => {
    const own = linkedLyra({
      col: 7,
      row: 2,
      layer: 'objects',
      facing: 90,
      flipX: true,
      forms: [...LYRA_FORMS],
      activeFormId: WOLF_FORM_ID,
      light: TORCH,
      lightLit: false,
    });
    const [token] = resolveLinkedTokens([own], [character]);
    expect(token).toMatchObject({
      id: own.id,
      col: 7,
      row: 2,
      width: 1,
      height: 1,
      layer: 'objects',
      facing: 90,
      flipX: true,
      forms: LYRA_FORMS,
      activeFormId: WOLF_FORM_ID,
      sight: null,
      light: TORCH,
      lightLit: false,
      characterId: LYRA_CHARACTER_ID,
    });
  });

  it('a free token passes as it came, even with characters around', () => {
    const free = kael();
    expect(resolveLinkedTokens([free], [character])[0]).toBe(free);
  });

  it('a token of another character wears only that one', () => {
    const [token] = resolveLinkedTokens([linkedLyra()], [kaelCharacter(), character]);
    expect(token?.name).toBe('Lyra Vandel');
  });

  it('with the character unknown (still loading) the token is the one of the snapshot', () => {
    const tokens = [linkedLyra()];
    expect(resolveLinkedTokens(tokens, [])).toBe(tokens);
  });

  it('the same input gives back the same array, and nothing to change gives the input', () => {
    const tokens = [linkedLyra(), kael()];
    const characters = [character];
    const first = resolveLinkedTokens(tokens, characters);
    expect(resolveLinkedTokens(tokens, characters)).toBe(first);
    expect(first).not.toBe(tokens);
    expect(resolveLinkedTokens(first, characters)).toBe(first);
    expect(first[1]).toBe(tokens[1]);
  });

  it('a new characters array resolves again; the same character values keep the token', () => {
    const tokens = [linkedLyra()];
    const first = resolveLinkedTokens(tokens, [character]);
    expect(resolveLinkedTokens(first, [character])).toBe(first);
    const hurt = lyraCharacter({ bars: [] });
    expect(resolveLinkedTokens(tokens, [hurt])[0]?.bars).toBe(hurt.bars);
  });
});

describe('boardWithTable', () => {
  it('takes the defined conditions from the cast and dresses the linked tokens in their characters', () => {
    const cast = castBoard();
    const grid = vharnBoard({ tokens: [linkedLyra()] });
    const characters = [lyraCharacter()];
    const board = boardWithTable(grid, { cast, characters });
    expect(board.conditionDefinitions).toBe(cast.conditionDefinitions);
    expect(board.tokens[0]?.bars[0]?.current).toBe(25);
    expect(board.version).toBe(grid.version);
    expect(boardWithTable(grid, { cast, characters })).toBe(board);
  });

  it('the characters alone (the cast still loading) already dress the linked tokens', () => {
    const grid = vharnBoard({ tokens: [linkedLyra()] });
    const board = boardWithTable(grid, { cast: null, characters: [lyraCharacter()] });
    expect(board.tokens[0]?.bars[0]?.current).toBe(25);
    expect(board.conditionDefinitions).toBe(grid.conditionDefinitions);
  });

  it('another characters array with the same cast composes again', () => {
    const cast = castBoard();
    const grid = vharnBoard({ tokens: [linkedLyra()] });
    const first = boardWithTable(grid, { cast, characters: [lyraCharacter()] });
    const hurt = lyraCharacter({ bars: [] });
    expect(boardWithTable(grid, { cast, characters: [hurt] }).tokens[0]?.bars).toEqual([]);
    expect(first.tokens[0]?.bars).toHaveLength(2);
  });

  it('a free token shows the edit of a definition the cast already has', () => {
    const grid = vharnBoard({
      tokens: [kael({ conditions: [activeCondition()] })],
      conditionDefinitions: [conditionDefinition()],
    });
    const edited = conditionDefinition({ name: 'Nauseado', description: 'Desvantagem.' });
    const cast = castBoard({ conditionDefinitions: [edited] });
    expect(boardWithTable(grid, { cast, characters: null }).tokens[0]?.conditions).toEqual([
      expect.objectContaining({
        name: 'Nauseado',
        description: 'Desvantagem.',
        remainingRounds: 2,
      }),
    ]);
  });

  it('a free token loses a condition the cast deleted from the list', () => {
    const grid = vharnBoard({
      tokens: [kael({ conditions: [activeCondition()] })],
      conditionDefinitions: [conditionDefinition()],
    });
    const cast = castBoard({ conditionDefinitions: [] });
    expect(boardWithTable(grid, { cast, characters: null }).tokens[0]?.conditions).toEqual([]);
  });

  it('a cast list that changes no token keeps the grid tokens array', () => {
    const grid = vharnBoard({
      tokens: [kael({ conditions: [activeCondition()] })],
      conditionDefinitions: [conditionDefinition()],
    });
    const cast = castBoard({ tokens: [], conditionDefinitions: [conditionDefinition()] });
    expect(boardWithTable(grid, { cast, characters: null }).tokens).toBe(grid.tokens);
  });

  it('a free token clamps its stacks to the lower max the cast list has', () => {
    const grid = vharnBoard({
      tokens: [kael({ conditions: [activeCondition({ maxStacks: 5, stacks: 5 })] })],
      conditionDefinitions: [conditionDefinition({ maxStacks: 5 })],
    });
    const cast = castBoard({ conditionDefinitions: [conditionDefinition({ maxStacks: 2 })] });
    expect(boardWithTable(grid, { cast, characters: null }).tokens[0]?.conditions).toEqual([
      expect.objectContaining({ maxStacks: 2, stacks: 2 }),
    ]);
  });

  it('without cast nor characters the board is the grid snapshot', () => {
    const grid = vharnBoard({ tokens: [linkedLyra()] });
    expect(boardWithTable(grid, { cast: null, characters: null })).toBe(grid);
  });
});
