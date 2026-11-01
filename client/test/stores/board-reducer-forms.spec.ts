import { describe, expect, it } from 'vitest';
import { applyBoardEvent } from '@/stores/board-reducer';
import { linkedLyra } from '../support/character-fixtures';
import { vharnEventBase } from '../support/drawing-fixtures';
import { KAEL_ID, LYRA_ID, kael, vharnBoard } from '../support/table-session-fixtures';
import {
  BASE_FORM_ID,
  LYRA_FORMS,
  WOLF_FORM_ID,
  WOLF_IMAGE_ID,
  formChangedAt,
  formSwitchedAt,
  shapeshiftingLyra,
} from '../support/token-form-fixtures';

describe('applyBoardEvent, token forms', () => {
  it('token:formChanged of the grid gives Lyra the image, the box and the active form', () => {
    const board = vharnBoard({ tokens: [shapeshiftingLyra(), kael()] });

    const next = applyBoardEvent(
      board,
      formChangedAt(5, { box: { col: 8, row: 4, width: 2, height: 2 } }),
    );

    expect(next.tokens[0]).toMatchObject({
      imageAssetId: WOLF_IMAGE_ID,
      activeFormId: WOLF_FORM_ID,
      frame: 'round',
      col: 8,
      row: 4,
      width: 2,
      height: 2,
    });
    expect(next.tokens[0]?.forms).toEqual(LYRA_FORMS);
    expect(next.tokens[1]).toEqual(kael());
    expect(next.version).toBe(5);
  });

  it('token:formChanged without a box changes only that token: image and form, not its box', () => {
    const elsewhere = linkedLyra({ id: KAEL_ID, col: 7, row: 2, activeFormId: BASE_FORM_ID });
    const board = vharnBoard({ tokens: [linkedLyra({ col: 0, row: 0 }), elsewhere] });

    const next = applyBoardEvent(board, formSwitchedAt(5, LYRA_ID));

    expect(next.tokens[0]).toMatchObject({
      imageAssetId: WOLF_IMAGE_ID,
      activeFormId: WOLF_FORM_ID,
      frame: 'round',
      col: 0,
      row: 0,
      width: 1,
      height: 1,
    });
    expect(next.tokens[1]).toEqual(elsewhere);
  });

  it('token:restyledMany with an image clears the active form, as the server does', () => {
    const board = vharnBoard({ tokens: [shapeshiftingLyra({ activeFormId: WOLF_FORM_ID })] });

    const next = applyBoardEvent(board, {
      type: 'tokensRestyled',
      payload: {
        ...vharnEventBase(5),
        tokenIds: [LYRA_ID],
        style: { imageAssetId: WOLF_IMAGE_ID },
      },
    });

    expect(next.tokens[0]?.activeFormId).toBeNull();
  });

  it('token:restyledMany with the image it already has keeps the active form', () => {
    const board = vharnBoard({ tokens: [shapeshiftingLyra({ activeFormId: WOLF_FORM_ID })] });

    const next = applyBoardEvent(board, {
      type: 'tokensRestyled',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID], style: { imageAssetId: null } },
    });

    expect(next.tokens[0]?.activeFormId).toBe(WOLF_FORM_ID);
  });

  it('token:restyledMany with a frame clears the active form, as the server does', () => {
    const board = vharnBoard({ tokens: [shapeshiftingLyra({ activeFormId: WOLF_FORM_ID })] });

    const next = applyBoardEvent(board, {
      type: 'tokensRestyled',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID], style: { frame: 'round' } },
    });

    expect(next.tokens[0]?.activeFormId).toBeNull();
  });

  it('token:restyledMany with the frame it already has keeps the active form', () => {
    const board = vharnBoard({ tokens: [shapeshiftingLyra({ activeFormId: WOLF_FORM_ID })] });

    const next = applyBoardEvent(board, {
      type: 'tokensRestyled',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID], style: { frame: 'square' } },
    });

    expect(next.tokens[0]?.activeFormId).toBe(WOLF_FORM_ID);
  });

  it('token:restyledMany without an image keeps the active form', () => {
    const board = vharnBoard({ tokens: [shapeshiftingLyra({ activeFormId: WOLF_FORM_ID })] });

    const next = applyBoardEvent(board, {
      type: 'tokensRestyled',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID], style: { flipX: true } },
    });

    expect(next.tokens[0]?.activeFormId).toBe(WOLF_FORM_ID);
  });

  it('token:resizedMany clears the active form of the resized token only', () => {
    const board = vharnBoard({
      tokens: [shapeshiftingLyra(), kael({ activeFormId: WOLF_FORM_ID })],
    });

    const next = applyBoardEvent(board, {
      type: 'tokensResized',
      payload: {
        ...vharnEventBase(5),
        resizes: [{ tokenId: LYRA_ID, col: 3, row: 4, width: 2, height: 1 }],
      },
    });

    expect(next.tokens.map(({ activeFormId }) => activeFormId)).toEqual([null, WOLF_FORM_ID]);
  });

  // The forms of a linked token are its own (no anchor any more): resized by hand, it has none.
  it('token:resizedMany clears the form of a linked token too, as the server does', () => {
    const board = vharnBoard({ tokens: [linkedLyra({ activeFormId: WOLF_FORM_ID })] });

    const next = applyBoardEvent(board, {
      type: 'tokensResized',
      payload: {
        ...vharnEventBase(5),
        resizes: [{ tokenId: LYRA_ID, col: 3, row: 4, width: 2, height: 1 }],
      },
    });

    expect(next.tokens[0]?.activeFormId).toBeNull();
  });

  it('token:resizedMany that only moves the origin keeps the active form', () => {
    const lyra = shapeshiftingLyra({ activeFormId: WOLF_FORM_ID });
    const board = vharnBoard({ tokens: [lyra] });

    const next = applyBoardEvent(board, {
      type: 'tokensResized',
      payload: {
        ...vharnEventBase(5),
        resizes: [{ tokenId: LYRA_ID, col: 1, row: 1, width: lyra.width, height: lyra.height }],
      },
    });

    expect(next.tokens[0]?.activeFormId).toBe(WOLF_FORM_ID);
  });
});
