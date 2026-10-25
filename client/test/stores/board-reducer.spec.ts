import { describe, expect, it } from 'vitest';
import { applyBoardEvent } from '@/stores/board-reducer';
import { PATH_ID, path, SQUARE_ID, square, vharnEventBase } from '../support/drawing-fixtures';
import { ANA_CIRCLE_ID, BIA_CONE_ID, anaCircle, biaCone } from '../support/effect-area-fixtures';
import {
  CELL_DOOR_ID,
  NORTH_WALL_ID,
  cellDoor,
  grateBox,
  northWall,
} from '../support/wall-fixtures';
import {
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  activeCondition,
  conditionDefinition,
  KAEL_COMBATANT,
  KAEL_ID,
  LYRA_COMBATANT,
  LYRA_ID,
  kael,
  lyra,
  memberCard,
  sceneUpdated,
  soloCombatant,
  tokenDeletedAt,
  tokenUpdatedAt,
  VHARN_SCENE,
  vharnBoard,
  vharnCombat,
} from '../support/table-session-fixtures';
import { BRAZIER_ID, CORRIDOR_TORCH_ID, brazier, corridorTorch } from '../support/light-fixtures';
import { fireAura, goldAura, runeAura } from '../support/aura-fixtures';

describe('applyBoardEvent, effect areas', () => {
  it('the snapshot carries the areas of the scene', () => {
    expect(vharnBoard({ effectAreas: [biaCone()] }).effectAreas).toEqual([biaCone()]);
  });

  it('effectArea:createdMany appends the new areas after the ones already there', () => {
    const board = vharnBoard({ effectAreas: [biaCone()] });

    const next = applyBoardEvent(board, {
      type: 'effectAreasCreated',
      payload: { ...vharnEventBase(5), effectAreas: [anaCircle()] },
    });

    expect(next.effectAreas.map(({ id }) => id)).toEqual([BIA_CONE_ID, ANA_CIRCLE_ID]);
    expect(next.version).toBe(5);
  });

  it('effectArea:reshapedMany swaps the whole shape of each area, keeping its id and author', () => {
    const board = vharnBoard({ effectAreas: [biaCone(), anaCircle()] });
    const line = { kind: 'line', x: 2.5, y: 2.5, reach: 4, facing: 30, color: 'gold' } as const;

    const next = applyBoardEvent(board, {
      type: 'effectAreasReshaped',
      payload: { ...vharnEventBase(5), reshapes: [{ effectAreaId: BIA_CONE_ID, shape: line }] },
    });

    expect(next.effectAreas).toEqual([
      { ...line, id: BIA_CONE_ID, authorId: biaCone().authorId },
      anaCircle(),
    ]);
  });

  it('effectArea:deletedMany takes the listed areas off and keeps the rest', () => {
    const board = vharnBoard({ effectAreas: [biaCone(), anaCircle()] });

    const next = applyBoardEvent(board, {
      type: 'effectAreasDeleted',
      payload: { ...vharnEventBase(5), effectAreaIds: [BIA_CONE_ID] },
    });

    expect(next.effectAreas).toEqual([anaCircle()]);
  });
});

describe('applyBoardEvent, drawings', () => {
  it('drawing:createdMany appends the new drawings after the ones already there', () => {
    const board = vharnBoard({ drawings: [square()] });

    const next = applyBoardEvent(board, {
      type: 'drawingsCreated',
      payload: { ...vharnEventBase(5), drawings: [path()] },
    });

    expect(next.drawings.map(({ id }) => id)).toEqual([SQUARE_ID, PATH_ID]);
    expect(next.version).toBe(5);
  });

  it('drawing:movedMany changes only the corner of each moved drawing', () => {
    const board = vharnBoard({ drawings: [square(), path()] });

    const next = applyBoardEvent(board, {
      type: 'drawingsMoved',
      payload: { ...vharnEventBase(5), moves: [{ drawingId: PATH_ID, x: 7.5, y: 2 }] },
    });

    expect(next.drawings).toEqual([square(), path({ x: 7.5, y: 2 })]);
  });

  it('drawing:deletedMany takes the listed drawings off and keeps the rest', () => {
    const board = vharnBoard({ drawings: [square(), path()] });

    const next = applyBoardEvent(board, {
      type: 'drawingsDeleted',
      payload: { ...vharnEventBase(5), drawingIds: [SQUARE_ID] },
    });

    expect(next.drawings).toEqual([path()]);
  });
});

describe('applyBoardEvent, facing and look', () => {
  it('token:facedMany changes only the facing of the listed tokens', () => {
    const board = vharnBoard({ tokens: [lyra(), kael()] });

    const next = applyBoardEvent(board, {
      type: 'tokensFaced',
      payload: { ...vharnEventBase(5), faces: [{ tokenId: LYRA_ID, facing: 135 }] },
    });

    expect(next.tokens.map(({ id, facing }) => [id, facing])).toEqual([
      [LYRA_ID, 135],
      [KAEL_ID, 0],
    ]);
    expect(next.version).toBe(5);
  });

  it('token:resizedMany gives the listed tokens their new box and leaves the rest', () => {
    const board = vharnBoard({ tokens: [lyra(), kael()] });

    const next = applyBoardEvent(board, {
      type: 'tokensResized',
      payload: {
        ...vharnEventBase(5),
        resizes: [{ tokenId: LYRA_ID, col: 2.5, row: 4, width: 1.5, height: 0.5 }],
      },
    });

    expect(
      next.tokens.map(({ id, col, row, width, height }) => [id, col, row, width, height]),
    ).toEqual([
      [LYRA_ID, 2.5, 4, 1.5, 0.5],
      [KAEL_ID, 5, 4, 1, 1],
    ]);
  });

  it('token:restyledMany with a flip changes only the flip', () => {
    const board = vharnBoard({ tokens: [lyra({ frame: 'round' })] });

    const next = applyBoardEvent(board, {
      type: 'tokensRestyled',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID], style: { flipX: true } },
    });

    expect(next.tokens[0]).toMatchObject({ flipX: true, flipY: false, frame: 'round' });
  });

  it('token:restyledMany with a null image takes the image away', () => {
    const board = vharnBoard({ tokens: [lyra({ imageAssetId: KAEL_ID })] });

    const next = applyBoardEvent(board, {
      type: 'tokensRestyled',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID], style: { imageAssetId: null } },
    });

    expect(next.tokens[0]?.imageAssetId).toBeNull();
  });

  it('scene:updated with a background brings it into the scene', () => {
    const background = { assetId: KAEL_ID, width: 1400, height: 700 };
    const next = applyBoardEvent(vharnBoard(), {
      type: 'sceneUpdated',
      payload: sceneUpdated({ scene: { ...VHARN_SCENE, background } }),
    });

    expect(next.scene.background).toEqual(background);
  });
});

describe('applyBoardEvent, token batches', () => {
  it('token:createdMany appends every pasted token', () => {
    const board = vharnBoard({ tokens: [lyra()] });

    const next = applyBoardEvent(board, {
      type: 'tokensCreated',
      payload: { ...vharnEventBase(5), tokens: [kael()], combat: null },
    });

    expect(next.tokens.map(({ id }) => id)).toEqual([LYRA_ID, KAEL_ID]);
  });

  it('token:createdMany brings the combat with the copies in the entry of their original', () => {
    const board = vharnBoard({ tokens: [lyra()], combat: vharnCombat() });
    const withCopy = vharnCombat({
      combatants: [
        { ...soloCombatant(LYRA_COMBATANT, LYRA_ID, 14, 1), tokenIds: [LYRA_ID, KAEL_ID] },
      ],
    });

    const next = applyBoardEvent(board, {
      type: 'tokensCreated',
      payload: { ...vharnEventBase(5), tokens: [kael()], combat: withCopy },
    });

    expect(next.combat).toEqual(withCopy);
  });

  it('token:createdMany with combat null leaves the board without combat', () => {
    const board = vharnBoard({ tokens: [lyra()], combat: vharnCombat() });

    const next = applyBoardEvent(board, {
      type: 'tokensCreated',
      payload: { ...vharnEventBase(5), tokens: [kael()], combat: null },
    });

    expect(next.combat).toBeNull();
  });

  it('combat:updated keeps the name and the tokens of a grouped entry', () => {
    const inimigos = {
      ...soloCombatant(KAEL_COMBATANT, 'goblin-token', 15, 0),
      name: 'Inimigos',
      tokenIds: ['goblin-token', 'lobo-token'],
    };
    const combat = vharnCombat({ combatants: [inimigos] });

    const next = applyBoardEvent(vharnBoard({ combat: vharnCombat() }), {
      type: 'combatUpdated',
      payload: { ...vharnEventBase(5), combat },
    });

    expect(next.combat?.combatants).toEqual([inimigos]);
  });

  it('token:deletedMany takes the tokens off and brings the combat as it is after they left', () => {
    const board = vharnBoard({ tokens: [lyra(), kael()], combat: vharnCombat() });
    const after = vharnCombat({ currentCombatantId: null, combatants: [] });

    const next = applyBoardEvent(board, {
      type: 'tokensDeleted',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID, KAEL_ID], combat: after },
    });

    expect(next.tokens).toEqual([]);
    expect(next.combat).toEqual(after);
  });
});

describe('applyBoardEvent, walls', () => {
  it('wall:createdMany appends the new walls after the ones already there', () => {
    const board = vharnBoard({ walls: [northWall()] });

    const next = applyBoardEvent(board, {
      type: 'wallsCreated',
      payload: { ...vharnEventBase(5), walls: [cellDoor()] },
    });

    expect(next.walls.map(({ id }) => id)).toEqual([NORTH_WALL_ID, CELL_DOOR_ID]);
    expect(next.version).toBe(5);
  });

  it('wall:movedMany changes only x and y of each listed wall', () => {
    const board = vharnBoard({ walls: [northWall(), cellDoor()] });

    const next = applyBoardEvent(board, {
      type: 'wallsMoved',
      payload: { ...vharnEventBase(5), moves: [{ wallId: NORTH_WALL_ID, x: 3, y: 4 }] },
    });

    expect(next.walls).toEqual([northWall({ x: 3, y: 4 }), cellDoor()]);
  });

  it('wall:deletedMany takes the listed walls off and keeps the rest', () => {
    const board = vharnBoard({ walls: [northWall(), cellDoor(), grateBox()] });

    const next = applyBoardEvent(board, {
      type: 'wallsDeleted',
      payload: { ...vharnEventBase(5), wallIds: [NORTH_WALL_ID, CELL_DOOR_ID] },
    });

    expect(next.walls).toEqual([grateBox()]);
  });

  it('wall:kindsChanged changes the kind and the door state of each listed wall', () => {
    const board = vharnBoard({ walls: [northWall(), cellDoor()] });

    const next = applyBoardEvent(board, {
      type: 'wallKindsChanged',
      payload: {
        ...vharnEventBase(5),
        changes: [
          { wallId: NORTH_WALL_ID, kind: 'door', doorState: 'closed' },
          { wallId: CELL_DOOR_ID, kind: 'grate', doorState: null },
        ],
      },
    });

    expect(next.walls).toEqual([
      northWall({ kind: 'door', doorState: 'closed' }),
      cellDoor({ kind: 'grate', doorState: null }),
    ]);
  });

  it('wall:areaErased takes the walls touched out and puts what is left at the end', () => {
    const board = vharnBoard({ walls: [northWall(), grateBox()] });
    const rest = northWall({ id: CELL_DOOR_ID, width: 1 });

    const next = applyBoardEvent(board, {
      type: 'wallAreaErased',
      payload: { ...vharnEventBase(5), wallIds: [northWall().id], walls: [rest] },
    });

    expect(next.walls).toEqual([grateBox(), rest]);
  });

  it('wall:segmentErased takes the wall out and puts what is left at the end', () => {
    const board = vharnBoard({ walls: [grateBox(), northWall()] });
    const rest = northWall({ id: CELL_DOOR_ID, x: 9 });

    const next = applyBoardEvent(board, {
      type: 'wallSegmentErased',
      payload: { ...vharnEventBase(5), wallId: grateBox().id, walls: [rest] },
    });

    expect(next.walls).toEqual([northWall(), rest]);
  });

  it('wall:doorChanged changes only the state of that door', () => {
    const board = vharnBoard({ walls: [northWall(), cellDoor()] });

    const next = applyBoardEvent(board, {
      type: 'doorChanged',
      payload: { ...vharnEventBase(5), wallId: CELL_DOOR_ID, doorState: 'open' },
    });

    expect(next.walls).toEqual([northWall(), cellDoor({ doorState: 'open' })]);
  });
});

describe('applyBoardEvent, lights', () => {
  it('light:createdMany appends the new lights after the ones already there', () => {
    const board = vharnBoard({ lights: [corridorTorch()] });

    const next = applyBoardEvent(board, {
      type: 'lightsCreated',
      payload: { ...vharnEventBase(5), lights: [brazier()] },
    });

    expect(next.lights.map(({ id }) => id)).toEqual([CORRIDOR_TORCH_ID, BRAZIER_ID]);
    expect(next.version).toBe(5);
  });

  it('light:movedMany changes only x and y of each listed light', () => {
    const board = vharnBoard({ lights: [corridorTorch(), brazier()] });

    const next = applyBoardEvent(board, {
      type: 'lightsMoved',
      payload: { ...vharnEventBase(5), moves: [{ lightId: CORRIDOR_TORCH_ID, x: 3, y: 4.5 }] },
    });

    expect(next.lights).toEqual([corridorTorch({ x: 3, y: 4.5 }), brazier()]);
  });

  it('light:rangesChanged changes only bright and dim of each listed light', () => {
    const board = vharnBoard({ lights: [corridorTorch(), brazier()] });

    const next = applyBoardEvent(board, {
      type: 'lightRangesChanged',
      payload: {
        ...vharnEventBase(5),
        changes: [{ lightId: BRAZIER_ID, bright: 6, dim: 0 }],
      },
    });

    expect(next.lights).toEqual([corridorTorch(), brazier({ bright: 6, dim: 0 })]);
  });

  it('light:colorsChanged changes only the color of each listed light', () => {
    const board = vharnBoard({ lights: [corridorTorch({ lit: false }), brazier()] });

    const next = applyBoardEvent(board, {
      type: 'lightColorsChanged',
      payload: { ...vharnEventBase(5), changes: [{ lightId: CORRIDOR_TORCH_ID, color: 'fire' }] },
    });

    expect(next.lights).toEqual([corridorTorch({ lit: false, color: 'fire' }), brazier()]);
  });

  it('light:colorsChanged with color null turns the light back to neutral', () => {
    const board = vharnBoard({ lights: [corridorTorch({ color: 'moon' })] });

    const next = applyBoardEvent(board, {
      type: 'lightColorsChanged',
      payload: { ...vharnEventBase(5), changes: [{ lightId: CORRIDOR_TORCH_ID, color: null }] },
    });

    expect(next.lights).toEqual([corridorTorch()]);
  });

  it('light:conesChanged changes only where the light points and how wide it opens', () => {
    const board = vharnBoard({ lights: [corridorTorch({ lit: false, color: 'fire' }), brazier()] });

    const next = applyBoardEvent(board, {
      type: 'lightConesChanged',
      payload: {
        ...vharnEventBase(5),
        changes: [{ lightId: CORRIDOR_TORCH_ID, facing: 90, angle: 60 }],
      },
    });

    expect(next.lights).toEqual([
      corridorTorch({ lit: false, color: 'fire', facing: 90, angle: 60 }),
      brazier(),
    ]);
  });

  it('light:createdMany with an arcane light enters with its color', () => {
    const next = applyBoardEvent(vharnBoard(), {
      type: 'lightsCreated',
      payload: { ...vharnEventBase(5), lights: [brazier({ color: 'arcane' })] },
    });

    expect(next.lights.map(({ color }) => color)).toEqual(['arcane']);
  });

  it('light:litChanged changes only lit of each listed light', () => {
    const board = vharnBoard({ lights: [corridorTorch(), brazier()] });

    const next = applyBoardEvent(board, {
      type: 'lightsLitChanged',
      payload: { ...vharnEventBase(5), lightIds: [CORRIDOR_TORCH_ID], lit: false },
    });

    expect(next.lights).toEqual([corridorTorch({ lit: false }), brazier()]);
  });

  it('light:deletedMany takes the listed lights off and keeps the rest', () => {
    const board = vharnBoard({ lights: [corridorTorch(), brazier()] });

    const next = applyBoardEvent(board, {
      type: 'lightsDeleted',
      payload: { ...vharnEventBase(5), lightIds: [CORRIDOR_TORCH_ID] },
    });

    expect(next.lights).toEqual([brazier()]);
  });

  it('token:restyledMany with lightLit changes only the switch of the token light', () => {
    const torchBearer = lyra({
      light: { bright: 4, dim: 4, color: null, angle: 360 },
      frame: 'round',
    });
    const board = vharnBoard({ tokens: [torchBearer] });

    const next = applyBoardEvent(board, {
      type: 'tokensRestyled',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID], style: { lightLit: false } },
    });

    expect(next.tokens).toEqual([{ ...torchBearer, lightLit: false }]);
  });

  it('token:updated with a field of view of 90° replaces it', () => {
    const board = vharnBoard({ tokens: [lyra()] });

    const next = applyBoardEvent(board, {
      type: 'tokenUpdated',
      payload: { ...vharnEventBase(5), token: lyra({ sightAngle: 90 }) },
    });

    expect(next.tokens.map(({ sightAngle }) => sightAngle)).toEqual([90]);
  });
});

describe('applyBoardEvent, main tokens', () => {
  const BIA = BIA_AT_TABLE.userId;
  const CAIO = CAIO_AT_TABLE.userId;
  const sharedLyra = lyra({ controllerIds: [BIA, CAIO] });

  function mainChanged(version: number, userId: string, tokenId: string) {
    return {
      type: 'mainTokenChanged' as const,
      payload: { ...vharnEventBase(version), userId, tokenId },
    };
  }

  it('the first choice of Bia comes in', () => {
    const board = vharnBoard({ tokens: [lyra(), kael()] });

    const next = applyBoardEvent(board, mainChanged(5, BIA, KAEL_ID));

    expect(next.mainTokens).toEqual([{ userId: BIA, tokenId: KAEL_ID }]);
  });

  it('a new choice of Bia replaces hers and keeps the one of Caio', () => {
    const board = vharnBoard({
      tokens: [sharedLyra, kael({ controllerIds: [BIA, CAIO] })],
      mainTokens: [
        { userId: BIA, tokenId: LYRA_ID },
        { userId: CAIO, tokenId: LYRA_ID },
      ],
    });

    const next = applyBoardEvent(board, mainChanged(5, BIA, KAEL_ID));

    expect(next.mainTokens).toEqual([
      { userId: CAIO, tokenId: LYRA_ID },
      { userId: BIA, tokenId: KAEL_ID },
    ]);
  });

  it('a token:updated that takes Bia off the control of Lyra drops her choice and keeps Caio’s', () => {
    const board = vharnBoard({
      tokens: [sharedLyra],
      mainTokens: [
        { userId: BIA, tokenId: LYRA_ID },
        { userId: CAIO, tokenId: LYRA_ID },
      ],
    });

    const next = applyBoardEvent(board, tokenUpdatedAt(5, lyra({ controllerIds: [CAIO] })));

    expect(next.mainTokens).toEqual([{ userId: CAIO, tokenId: LYRA_ID }]);
  });

  it('token:deleted drops the choices of the deleted token', () => {
    const board = vharnBoard({
      tokens: [lyra(), kael()],
      mainTokens: [{ userId: BIA, tokenId: LYRA_ID }],
    });

    expect(applyBoardEvent(board, tokenDeletedAt(5, LYRA_ID)).mainTokens).toEqual([]);
  });

  it('token:deletedMany drops the choices of the deleted tokens only', () => {
    const board = vharnBoard({
      tokens: [sharedLyra, kael({ controllerIds: [CAIO] })],
      mainTokens: [
        { userId: BIA, tokenId: LYRA_ID },
        { userId: CAIO, tokenId: KAEL_ID },
      ],
    });

    const next = applyBoardEvent(board, {
      type: 'tokensDeleted',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID], combat: null },
    });

    expect(next.mainTokens).toEqual([{ userId: CAIO, tokenId: KAEL_ID }]);
  });
});

describe('applyBoardEvent, member cards', () => {
  const CAIO_CARD = memberCard({ userId: CAIO_AT_TABLE.userId, armorClass: 12 });

  function cardChanged(version: number, card = memberCard({ armorClass: 15 })) {
    return { type: 'memberCardChanged' as const, payload: { ...vharnEventBase(version), card } };
  }

  it('the first card of Bia comes in', () => {
    const next = applyBoardEvent(vharnBoard(), cardChanged(5));

    expect(next.memberCards).toEqual([memberCard({ armorClass: 15 })]);
  });

  it('a card already there is replaced in place and the one of Caio stays', () => {
    const board = vharnBoard({ memberCards: [memberCard({ noteOne: 'Ferida' }), CAIO_CARD] });

    const next = applyBoardEvent(board, cardChanged(5, memberCard({ armorClass: 15 })));

    expect(next.memberCards).toEqual([memberCard({ armorClass: 15 }), CAIO_CARD]);
  });
});

describe('applyBoardEvent, conditions of the cast', () => {
  it('condition:changedMany gives each anchor listed its conditions and leaves the others', () => {
    const poisoned = activeCondition({ remainingRounds: 1 });
    const board = vharnBoard({ tokens: [lyra({ conditions: [activeCondition()] }), kael()] });

    const next = applyBoardEvent(board, {
      type: 'conditionsChanged',
      payload: { ...vharnEventBase(5), changes: [{ tokenId: LYRA_ID, conditions: [poisoned] }] },
    });

    expect(next.tokens.map(({ conditions }) => conditions)).toEqual([[poisoned], []]);
  });
});

describe('applyBoardEvent, the table list of conditions', () => {
  const BLINDED_ID = 'f7a8b9c0-d1e2-4f3a-8b5c-6d7e8f901234';
  const blinded = conditionDefinition({ id: BLINDED_ID, name: 'Cego', icon: 'eye-off' });
  const edited = conditionDefinition({
    name: 'Nauseado',
    tone: 'incapacitating',
    icon: 'skull',
    look: 'unconscious',
    description: 'Desvantagem em ataques.',
  });
  const poisonedFor = (remainingRounds: number | null) => activeCondition({ remainingRounds });

  it('condition:definitionUpdated replaces the definition in the list', () => {
    const board = vharnBoard({ conditionDefinitions: [blinded, conditionDefinition()] });
    const next = applyBoardEvent(board, {
      type: 'conditionDefinitionUpdated',
      payload: { ...vharnEventBase(5), definition: edited },
    });
    expect(next.conditionDefinitions).toEqual([blinded, edited]);
  });

  it('condition:definitionUpdated shows the edit on every token holding it, keeping the rounds', () => {
    const board = vharnBoard({
      tokens: [lyra({ conditions: [poisonedFor(2)] }), kael({ conditions: [poisonedFor(null)] })],
      conditionDefinitions: [conditionDefinition()],
    });
    const next = applyBoardEvent(board, {
      type: 'conditionDefinitionUpdated',
      payload: { ...vharnEventBase(5), definition: edited },
    });
    expect(next.tokens.map(({ conditions }) => conditions)).toEqual([
      [
        {
          ...poisonedFor(2),
          name: 'Nauseado',
          tone: 'incapacitating',
          icon: 'skull',
          look: 'unconscious',
          description: 'Desvantagem em ataques.',
        },
      ],
      [
        {
          ...poisonedFor(null),
          name: 'Nauseado',
          tone: 'incapacitating',
          icon: 'skull',
          look: 'unconscious',
          description: 'Desvantagem em ataques.',
        },
      ],
    ]);
  });

  it('condition:definitionUpdated of a condition no token holds keeps the tokens array', () => {
    const board = vharnBoard({ tokens: [kael()], conditionDefinitions: [conditionDefinition()] });
    const next = applyBoardEvent(board, {
      type: 'conditionDefinitionUpdated',
      payload: { ...vharnEventBase(5), definition: edited },
    });
    expect(next.tokens).toBe(board.tokens);
  });

  it('condition:definitionUpdated with a lower max stacks clamps the stacks of every token', () => {
    const stacked = (stacks: number) => activeCondition({ maxStacks: 5, stacks });
    const board = vharnBoard({
      tokens: [lyra({ conditions: [stacked(5)] }), kael({ conditions: [stacked(1)] })],
      conditionDefinitions: [conditionDefinition({ maxStacks: 5 })],
    });
    const next = applyBoardEvent(board, {
      type: 'conditionDefinitionUpdated',
      payload: { ...vharnEventBase(5), definition: conditionDefinition({ maxStacks: 2 }) },
    });
    expect(next.tokens.map(({ conditions }) => conditions[0]?.stacks)).toEqual([2, 1]);
    expect(next.tokens.map(({ conditions }) => conditions[0]?.maxStacks)).toEqual([2, 2]);
  });

  it('condition:definitionDeleted takes it off the list and off every token', () => {
    const board = vharnBoard({
      tokens: [lyra({ conditions: [poisonedFor(2)] }), kael({ conditions: [poisonedFor(1)] })],
      conditionDefinitions: [conditionDefinition(), blinded],
    });
    const next = applyBoardEvent(board, {
      type: 'conditionDefinitionDeleted',
      payload: { ...vharnEventBase(5), conditionId: conditionDefinition().id },
    });
    expect(next.conditionDefinitions).toEqual([blinded]);
    expect(next.tokens.map(({ conditions }) => conditions)).toEqual([[], []]);
  });

  it('condition:defaultsRestored appends the definitions that came back', () => {
    const board = vharnBoard({ conditionDefinitions: [conditionDefinition()] });
    const next = applyBoardEvent(board, {
      type: 'conditionDefaultsRestored',
      payload: { ...vharnEventBase(5), definitions: [blinded] },
    });
    expect(next.conditionDefinitions).toEqual([conditionDefinition(), blinded]);
  });

  it('condition:defaultsRestored naming a definition already listed adds it once', () => {
    const board = vharnBoard({ conditionDefinitions: [blinded] });
    const next = applyBoardEvent(board, {
      type: 'conditionDefaultsRestored',
      payload: { ...vharnEventBase(5), definitions: [blinded] },
    });
    expect(next.conditionDefinitions).toEqual([blinded]);
  });
});

describe('applyBoardEvent, auras', () => {
  const restyled = (style: Record<string, unknown>, tokenIds = [LYRA_ID]) =>
    ({ type: 'tokensRestyled', payload: { ...vharnEventBase(5), tokenIds, style } }) as const;

  it('token:restyledMany with an aura changes only the aura of Lyra and keeps the other arrays', () => {
    const board = vharnBoard({ tokens: [lyra(), kael()], walls: [northWall()] });

    const next = applyBoardEvent(board, restyled({ aura: fireAura() }));

    expect(next.tokens).toEqual([lyra({ aura: fireAura() }), kael()]);
    expect(next.walls).toBe(board.walls);
  });

  it('token:restyledMany with a null aura takes the aura away', () => {
    const board = vharnBoard({ tokens: [lyra({ aura: goldAura() })] });

    const next = applyBoardEvent(board, restyled({ aura: null }));

    expect(next.tokens[0]?.aura).toBeNull();
  });

  it('token:restyledMany without an aura keeps the one Lyra had', () => {
    const board = vharnBoard({ tokens: [lyra({ aura: goldAura() })] });

    const next = applyBoardEvent(board, restyled({ flipX: true }));

    expect(next.tokens[0]?.aura).toEqual(goldAura());
  });

  it('token:restyledMany with a new aura replaces the old one whole, no field of it left behind', () => {
    const board = vharnBoard({ tokens: [lyra({ aura: fireAura({ color: 'steel' }) })] });

    const next = applyBoardEvent(board, restyled({ aura: runeAura() }));

    expect(next.tokens[0]?.aura).toEqual(runeAura());
  });
});
