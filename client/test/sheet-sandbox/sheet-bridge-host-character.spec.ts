import { describe, expect, it } from 'vitest';
import { boardTokenSource } from '@/sheet-sandbox/sheet-token-source';
import { createBoardStore } from '@/stores/board-store';
import { LYRA_PORTRAIT } from '../support/assets-api-fake';
import { VHARN } from '../support/campaigns-api-fake';
import { charactersSynced, lyraCharacter, LYRA_CHARACTER_ID } from '../support/character-fixtures';
import { sheetBridgeHarness } from '../support/sheet-bridge-harness';
import { LYRA_ID, lyra, vharnBoard } from '../support/table-session-fixtures';

const STATS = ['character:stats'] as const;
const PORTRAIT = ['character:portrait'] as const;
const PNG = () => ({ type: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]).buffer });
const NEW_PORTRAIT_ID = '7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';

function looseLyraToken() {
  const grid = createBoardStore(VHARN.id, () => undefined);
  grid.getState().apply({ kind: 'board', state: vharnBoard({ tokens: [lyra()] }) });
  return boardTokenSource(grid, LYRA_ID);
}

function codesOf(harness: Awaited<ReturnType<typeof sheetBridgeHarness>>): string[] {
  return harness.port.ofType('error').map(({ code }) => code);
}

describe('sheet bridge host: the character in the state', () => {
  it("a character's sheet gets its name, AC and DC", async () => {
    const harness = await sheetBridgeHarness();
    await harness.frameSends({ type: 'ready', requestId: '1' });
    expect(harness.port.ofType('state')[0]?.character).toEqual({
      name: 'Lyra',
      armorClass: 15,
      difficultyClass: null,
    });
  });

  it('a loose token and a sheet with no holder get character null', async () => {
    const loose = await sheetBridgeHarness({ tokenOf: looseLyraToken });
    const spare = await sheetBridgeHarness({ tokenOf: () => null });
    await loose.frameSends({ type: 'ready', requestId: '1' });
    await spare.frameSends({ type: 'ready', requestId: '1' });
    expect([loose, spare].map((h) => h.port.ofType('state')[0]?.character)).toEqual([null, null]);
  });

  it('character:changed with AC 14 sends a new state with armorClass 14', async () => {
    const harness = await sheetBridgeHarness();
    await harness.frameSends({ type: 'ready', requestId: '1' });
    harness.characters.getState().apply(charactersSynced(4, lyraCharacter({ armorClass: 14 })));
    const states = harness.port.ofType('state').map((state) => state.character?.armorClass);
    expect(states).toEqual([15, 14]);
  });

  it('a change the frame does not see (a note) sends no state', async () => {
    const harness = await sheetBridgeHarness();
    await harness.frameSends({ type: 'ready', requestId: '1' });
    harness.characters.getState().apply(charactersSynced(4, lyraCharacter({ noteOne: 'ferida' })));
    expect(harness.port.ofType('state')).toHaveLength(1);
  });
});

describe('sheet bridge host: character.set', () => {
  const set14 = { type: 'character.set', requestId: '2', changes: { armorClass: 14 } };

  it("becomes the holder's character:update and answers result", async () => {
    const harness = await sheetBridgeHarness({ permissions: STATS });
    await harness.frameSends(set14);
    expect({
      updates: harness.characterCommands.updates,
      results: harness.port.ofType('result'),
    }).toEqual({
      updates: [
        { campaignId: VHARN.id, characterId: LYRA_CHARACTER_ID, changes: { armorClass: 14 } },
      ],
      results: [{ type: 'result', requestId: '2' }],
    });
  });

  it('the values the character already has answer result with no command', async () => {
    const harness = await sheetBridgeHarness({ permissions: STATS });
    await harness.frameSends({ ...set14, changes: { armorClass: 15 } });
    expect({
      updates: harness.characterCommands.updates,
      results: harness.port.ofType('result').map(({ requestId }) => requestId),
    }).toEqual({ updates: [], results: ['2'] });
  });

  it('the values it already has do not count against the pace', async () => {
    const harness = await sheetBridgeHarness({ permissions: STATS });
    for (let index = 0; index < 10; index += 1)
      await harness.frameSends({
        ...set14,
        requestId: `s${index}`,
        changes: { armorClass: index },
      });
    await harness.frameSends({ ...set14, requestId: 'same', changes: { armorClass: 15 } });
    expect(harness.port.ofType('error')).toEqual([]);
  });

  it('without character:stats in the manifest is PERMISSION_NOT_DECLARED with no command', async () => {
    const harness = await sheetBridgeHarness();
    await harness.frameSends(set14);
    expect({
      error: harness.port.ofType('error')[0],
      updates: harness.characterCommands.updates,
    }).toEqual({
      error: {
        type: 'error',
        requestId: '2',
        code: 'PERMISSION_NOT_DECLARED',
        message: 'character.set needs permission character:stats in the manifest',
      },
      updates: [],
    });
  });

  it('without canEdit is FORBIDDEN with no command', async () => {
    const harness = await sheetBridgeHarness({ permissions: STATS, canEdit: false });
    await harness.frameSends(set14);
    expect({ codes: codesOf(harness), updates: harness.characterCommands.updates }).toEqual({
      codes: ['FORBIDDEN'],
      updates: [],
    });
  });

  it('a loose token or no holder is NO_CHARACTER', async () => {
    const loose = await sheetBridgeHarness({ permissions: STATS, tokenOf: looseLyraToken });
    const spare = await sheetBridgeHarness({ permissions: STATS, tokenOf: () => null });
    await loose.frameSends(set14);
    await spare.frameSends(set14);
    expect([codesOf(loose), codesOf(spare)]).toEqual([['NO_CHARACTER'], ['NO_CHARACTER']]);
  });

  it("the server's refusal comes back with its code", async () => {
    const harness = await sheetBridgeHarness({ permissions: STATS });
    harness.characterCommands.answer = { ok: false, failure: 'forbidden' };
    await harness.frameSends(set14);
    expect(codesOf(harness)).toEqual(['FORBIDDEN']);
  });

  it('an eleventh write in 10 s is RATE_LIMITED, and the window reopens', async () => {
    const harness = await sheetBridgeHarness({ permissions: STATS });
    for (let index = 0; index < 11; index += 1)
      await harness.frameSends({
        ...set14,
        requestId: `s${index}`,
        changes: { armorClass: index },
      });
    const limited = codesOf(harness);
    harness.clock.advance(10_000);
    await harness.frameSends({ ...set14, requestId: 'late', changes: { armorClass: 30 } });
    expect({ limited, updates: harness.characterCommands.updates.length }).toEqual({
      limited: ['RATE_LIMITED'],
      updates: 11,
    });
  });
});

describe('sheet bridge host: character.setImage', () => {
  const setImage = () => ({ type: 'character.setImage', requestId: '3', image: PNG() });

  it('uploads as a token image and writes it as the portrait', async () => {
    const harness = await sheetBridgeHarness({ permissions: PORTRAIT });
    harness.assets.answerWith({ ok: true, asset: { ...LYRA_PORTRAIT, id: NEW_PORTRAIT_ID } });
    await harness.frameSends(setImage());
    const [sent] = harness.assets.sent;
    expect({
      upload: sent ? [sent.kind, sent.campaignId, sent.purpose] : null,
      type: sent?.kind === 'upload' ? sent.file.type : null,
      updates: harness.characterCommands.updates.map(({ changes }) => changes),
      results: harness.port.ofType('result').map(({ requestId }) => requestId),
    }).toEqual({
      upload: ['upload', VHARN.id, 'token'],
      type: 'image/png',
      updates: [{ imageAssetId: NEW_PORTRAIT_ID }],
      results: ['3'],
    });
  });

  it('without character:portrait is PERMISSION_NOT_DECLARED with no upload', async () => {
    const harness = await sheetBridgeHarness({ permissions: STATS });
    await harness.frameSends(setImage());
    expect({ codes: codesOf(harness), sent: harness.assets.sent }).toEqual({
      codes: ['PERMISSION_NOT_DECLARED'],
      sent: [],
    });
  });

  it('a loose token is NO_CHARACTER with no upload', async () => {
    const harness = await sheetBridgeHarness({ permissions: PORTRAIT, tokenOf: looseLyraToken });
    await harness.frameSends(setImage());
    expect({ codes: codesOf(harness), sent: harness.assets.sent }).toEqual({
      codes: ['NO_CHARACTER'],
      sent: [],
    });
  });

  it('a failed upload writes nothing and comes back with its kind', async () => {
    const harness = await sheetBridgeHarness({ permissions: PORTRAIT });
    harness.assets.answerWith({ ok: false, failure: { kind: 'too_large' } });
    await harness.frameSends(setImage());
    expect({ codes: codesOf(harness), updates: harness.characterCommands.updates }).toEqual({
      codes: ['TOO_LARGE'],
      updates: [],
    });
  });

  it('a refused update after the upload comes back as an error', async () => {
    const harness = await sheetBridgeHarness({ permissions: PORTRAIT });
    harness.characterCommands.answer = { ok: false, failure: 'asset_not_found' };
    await harness.frameSends(setImage());
    expect(codesOf(harness)).toEqual(['ASSET_NOT_FOUND']);
  });
});
