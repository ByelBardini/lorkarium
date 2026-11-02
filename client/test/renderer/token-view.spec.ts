import { cell } from '@lorkarium/game-core';
import type { TokenDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { boardSightOf } from '@/lib/board-sight';
import { tokenViewsOf, type TokenViewInput } from '@/renderer/token-view';
import {
  BIA_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  VHARN_SCENE,
  activeCondition,
  kael,
  lyra,
  vharnBoard,
} from '../support/table-session-fixtures';

const GOLD_AURA = { kind: 'color', radius: 1, color: 'gold', opacity: 50 } as const;

const NOTHING_LOCAL: Omit<TokenViewInput, 'tokens'> = {
  selectedTokenIds: [],
  activeLayer: 'tokens',
  facingPreview: {},
  resizePreview: {},
  dragged: {},
  readOnly: false,
  currentTokenIds: [],
};

function viewsOf(overrides: Partial<TokenViewInput> = {}) {
  return tokenViewsOf({ ...NOTHING_LOCAL, tokens: [lyra()], ...overrides });
}

describe('tokenViewsOf', () => {
  it('a token is a disc with its initials, its side ring, its cell, its sides and its name', () => {
    expect(viewsOf()[0]).toMatchObject({
      id: LYRA_ID,
      name: 'Lyra',
      initials: 'LY',
      ring: 'ally',
      col: 3,
      row: 4,
      width: 1,
      height: 1,
      selected: false,
      draggable: true,
    });
  });

  it('the bar at position 0 is drawn under the token, filled by its value', () => {
    expect(viewsOf()[0]?.bar).toEqual({
      fraction: 32 / 45,
      state: 'normal',
      excess: 0,
      temp: 0,
      color: 'ember',
    });
  });

  it('without the bar at position 0 (hidden), the token has no bar even with position 1', () => {
    const redacted = lyra({ canControl: false, bars: lyra().bars.slice(1) });
    expect(viewsOf({ tokens: [redacted] })[0]?.bar).toBeNull();
  });

  it('a negative first bar is drawn as negative', () => {
    const [pv, inspiration] = lyra().bars;
    if (!pv || !inspiration) throw new Error('lyra() lost its bars');
    const hurt = lyra({ bars: [{ ...pv, current: -4 }, inspiration] });
    expect(viewsOf({ tokens: [hurt] })[0]?.bar?.state).toBe('negative');
  });

  it('every token of a selection of two is marked', () => {
    const views = viewsOf({ tokens: [lyra(), kael()], selectedTokenIds: [LYRA_ID, KAEL_ID] });
    expect(views.map(({ selected }) => selected)).toEqual([true, true]);
  });

  it('a resize of this viewer draws the token with its new box already', () => {
    const box = { col: 2, row: 4, width: 2, height: 1.5 };
    expect(viewsOf({ resizePreview: { [LYRA_ID]: box } })[0]).toMatchObject(box);
  });

  it('someone else dragging Lyra draws her on that cell', () => {
    expect(viewsOf({ dragged: { [LYRA_ID]: cell(7, 2) } })[0]).toMatchObject({ col: 7, row: 2 });
  });

  it('a token the viewer cannot control, or any token while read only, is not draggable', () => {
    expect(viewsOf({ tokens: [lyra({ canControl: false })] })[0]?.draggable).toBe(false);
    expect(viewsOf({ readOnly: true })[0]?.draggable).toBe(false);
  });

  it('a chest on objects with the tokens layer active is neither pickable nor draggable', () => {
    expect(viewsOf({ tokens: [kael({ layer: 'objects' })] })[0]).toMatchObject({
      layer: 'objects',
      pickable: false,
      draggable: false,
    });
  });

  it('with the objects layer active the chest is pickable and Lyra is not', () => {
    const views = viewsOf({ tokens: [lyra(), kael({ layer: 'objects' })], activeLayer: 'objects' });
    expect(views.map(({ id, pickable }) => [id, pickable])).toEqual([
      [KAEL_ID, true],
      [LYRA_ID, false],
    ]);
  });

  it('tokens are drawn background first, then objects, then tokens, in list order inside each', () => {
    const map = kael({ id: 'map', layer: 'background' });
    const chest = kael({ id: 'chest', layer: 'objects' });
    const views = viewsOf({ tokens: [lyra(), chest, kael(), map] });
    expect(views.map(({ id }) => id)).toEqual(['map', 'chest', LYRA_ID, KAEL_ID]);
  });

  it('every token of the entry on turn gets the ring, and the one out of it does not', () => {
    const goblins = [lyra({ id: 'goblin-1' }), lyra({ id: 'goblin-2' }), lyra({ id: KAEL_ID })];
    const views = viewsOf({ tokens: goblins, currentTokenIds: ['goblin-1', 'goblin-2'] });
    expect(views.map(({ id, onTurn }) => [id, onTurn])).toEqual([
      ['goblin-1', true],
      ['goblin-2', true],
      [KAEL_ID, false],
    ]);
  });

  it('a token with 7 conditions carries them by severity, without the ones that change its look, each with its rounds', () => {
    const conditions = [
      activeCondition({ id: 'a', icon: 'sparkles', tone: 'benefit', remainingRounds: null }),
      activeCondition({ id: 'b', icon: 'skull', tone: 'harm', remainingRounds: 2 }),
      activeCondition({ id: 'c', icon: 'lock', tone: 'incapacitating', remainingRounds: 1 }),
      activeCondition({ id: 'd', icon: 'ghost', tone: 'benefit', look: 'invisible' }),
      activeCondition({ id: 'e', icon: 'eye-off', tone: 'harm', remainingRounds: 3 }),
      activeCondition({ id: 'f', icon: 'zap', tone: 'incapacitating', remainingRounds: 4 }),
      activeCondition({ id: 'g', icon: 'moon', tone: 'harm', look: 'unconscious' }),
    ];
    const token = viewsOf({ tokens: [lyra({ conditions })] })[0];
    const plain = { color: null, stacks: null, imageUrl: null };
    expect(token?.conditions).toEqual([
      { icon: 'lock', tone: 'incapacitating', remainingRounds: 1, ...plain },
      { icon: 'zap', tone: 'incapacitating', remainingRounds: 4, ...plain },
      { icon: 'skull', tone: 'harm', remainingRounds: 2, ...plain },
      { icon: 'eye-off', tone: 'harm', remainingRounds: 3, ...plain },
      { icon: 'sparkles', tone: 'benefit', remainingRounds: null, ...plain },
    ]);
    expect(token?.looks).toEqual(['invisible', 'unconscious']);
  });

  it('each condition carries its color, null when it is painted by its nature', () => {
    const conditions = [
      activeCondition({ id: 'a', icon: 'skull', color: 'ember' }),
      activeCondition({ id: 'b', icon: 'eye-off', color: null }),
    ];
    const token = viewsOf({ tokens: [lyra({ conditions })] })[0];
    expect(token?.conditions.map(({ icon, color }) => [icon, color])).toEqual([
      ['skull', 'ember'],
      ['eye-off', null],
    ]);
  });

  it('a condition with an image carries its asset url, one without carries none', () => {
    const imageAssetId = '4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d';
    const conditions = [
      activeCondition({ id: 'a', icon: 'skull', imageAssetId }),
      activeCondition({ id: 'b', icon: 'eye-off', imageAssetId: null }),
    ];
    const token = viewsOf({ tokens: [lyra({ conditions })] })[0];
    expect(token?.conditions.map(({ icon, imageUrl }) => [icon, imageUrl])).toEqual([
      ['skull', `/api/assets/${imageAssetId}`],
      ['eye-off', null],
    ]);
  });

  it('a stacking condition carries its stacks, a non-stacking one none', () => {
    const conditions = [
      activeCondition({ id: 'a', icon: 'skull', maxStacks: 5, stacks: 3 }),
      activeCondition({ id: 'b', icon: 'zap', maxStacks: 5, stacks: 1 }),
      activeCondition({ id: 'c', icon: 'eye-off' }),
    ];
    const token = viewsOf({ tokens: [lyra({ conditions })] })[0];
    expect(token?.conditions.map(({ icon, stacks }) => [icon, stacks])).toEqual([
      ['skull', 3],
      ['zap', 1],
      ['eye-off', null],
    ]);
  });

  it('a token hidden from the players comes marked hidden; a visible one does not', () => {
    const views = viewsOf({ tokens: [lyra({ hidden: true }), kael()] });
    expect(views.map(({ id, hidden }) => [id, hidden])).toEqual([
      [LYRA_ID, true],
      [KAEL_ID, false],
    ]);
  });

  it('the aura follows the token where it is being dragged by someone else', () => {
    const views = viewsOf({
      tokens: [lyra({ aura: GOLD_AURA })],
      dragged: { [LYRA_ID]: cell(6, 2) },
    });
    expect(views[0]?.aura?.box).toEqual({ x: 320, y: 64, width: 192, height: 192 });
  });

  it('the aura grows with the size being dragged by a resize handle', () => {
    const resizing = { [LYRA_ID]: { col: 3, row: 4, width: 2, height: 2 } };
    const views = viewsOf({ tokens: [lyra({ aura: GOLD_AURA })], resizePreview: resizing });
    expect(views[0]?.aura?.box).toEqual({ x: 128, y: 192, width: 256, height: 256 });
  });

  describe('through the sight of Bia in the dark', () => {
    // Lyra (hers) at (3, 4) sees 3 + 3 cells: Kael at (8, 4) is 5 away (silhouette), the goblin
    // at (11, 4) 8 away (hidden).
    const GOBLIN_ID = 'cc33dd44-ee55-4f66-8a77-112233445566';
    const others = { canControl: false, controllerIds: [] };
    const tokens = [
      lyra({ sight: { bright: 3, dim: 3 } }),
      kael({
        ...others,
        col: 8,
        row: 4,
        conditions: [activeCondition()],
        defeated: true,
        hidden: true,
        aura: GOLD_AURA,
      }),
      kael({ ...others, id: GOBLIN_ID, col: 11, row: 4 }),
    ];
    const sightOf = (seen: readonly TokenDto[]) =>
      boardSightOf(
        vharnBoard({
          viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
          scene: { ...VHARN_SCENE, vision: 'dark' },
          tokens: [...seen],
        }),
        { previewEyeIds: null },
      );
    const views = viewsOf({ tokens, currentTokenIds: [KAEL_ID], sight: sightOf(tokens) });

    it('the token in the penumbra is a silhouette with no name, bar, marks, facing, defeat nor hidden mark, and cannot be taken', () => {
      expect(views.find(({ id }) => id === KAEL_ID)).toMatchObject({
        silhouette: 'square',
        defeated: false,
        hidden: false,
        name: '',
        initials: '',
        bar: null,
        conditions: [],
        looks: [],
        facingMark: false,
        onTurn: false,
        pickable: false,
        draggable: false,
        aura: null,
      });
    });

    it('a silhouette keeps its image, so the canvas paints the cut-out PNG black', () => {
      const PNG_ID = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';
      const cutOut = kael({ ...others, col: 8, row: 4, imageAssetId: PNG_ID, frame: 'square' });
      const seen = [lyra({ sight: { bright: 3, dim: 3 } }), cutOut];
      const [, shade] = viewsOf({ tokens: seen, sight: sightOf(seen) });

      expect(shade).toMatchObject({
        silhouette: 'square',
        art: { url: `/api/assets/${PNG_ID}`, frame: 'square' },
      });
    });

    it('the hidden token is not drawn at all, and her own is drawn whole', () => {
      expect(views.map(({ id }) => id)).toEqual([LYRA_ID, KAEL_ID]);
      expect(views[0]).toMatchObject({ silhouette: null, name: 'Lyra' });
    });
  });
});
