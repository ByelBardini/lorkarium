import { describe, expect, it } from 'vitest';
import {
  TOKEN_FORMS_MAX,
  setTokenFormCommandDto,
  tokenFormChangedDto,
  tokenFormsDto,
} from '../../src/board/token-form.dto';

const BASE = {
  actionId: '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a',
  campaignId: '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a',
};
const THOREN_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const WOLF_ID = '7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d';
const DWARF = {
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'Anão',
  imageAssetId: null,
  width: 1,
  height: 1,
  frame: 'square' as const,
};
const WOLF = { ...DWARF, id: WOLF_ID, name: 'Lobo atroz', width: 2, height: 2 };

function formOf(index: number): typeof DWARF {
  return { ...DWARF, id: `00000000-0000-4000-8000-00000000000${String(index)}`, name: `F${index}` };
}

function messagesOf(input: unknown): string[] {
  const result = tokenFormsDto.safeParse(input);
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('tokenFormsDto', () => {
  it('three valid forms are accepted in the order sent', () => {
    const bear = { ...DWARF, id: formOf(3).id, name: 'Urso', width: 1.5, height: 1.5 };

    expect(tokenFormsDto.parse([DWARF, WOLF, bear])).toEqual([DWARF, WOLF, bear]);
  });

  it('a name with only spaces is refused', () => {
    expect(messagesOf([{ ...DWARF, name: '   ' }])).toHaveLength(1);
  });

  it('a name of 31 characters is refused', () => {
    expect(messagesOf([{ ...DWARF, name: 'a'.repeat(31) }])).toHaveLength(1);
  });

  it(`${String(TOKEN_FORMS_MAX + 1)} forms are refused`, () => {
    const forms = Array.from({ length: TOKEN_FORMS_MAX + 1 }, (_, index) => formOf(index));

    expect(messagesOf(forms)).toHaveLength(1);
  });

  it('a form without frame is refused', () => {
    const frameless = { ...DWARF, frame: undefined };

    expect(messagesOf([frameless])).toHaveLength(1);
  });

  it('a frame other than square or round is refused', () => {
    expect(messagesOf([{ ...DWARF, frame: 'hexagon' }])).toHaveLength(1);
  });

  it('the same id twice is refused citing the id', () => {
    expect(messagesOf([WOLF, { ...WOLF, name: 'Lobo 2' }])).toEqual([
      expect.stringContaining(WOLF_ID),
    ]);
  });
});

describe('setTokenFormCommandDto', () => {
  it('a switch with the form the undo expects is accepted as sent', () => {
    const command = {
      ...BASE,
      tokenId: THOREN_ID,
      formId: WOLF_ID,
      expect: { activeFormId: null },
    };

    expect(setTokenFormCommandDto.parse(command)).toEqual(command);
  });

  it('a switch without formId is refused', () => {
    expect(setTokenFormCommandDto.safeParse({ ...BASE, tokenId: THOREN_ID }).success).toBe(false);
  });
});

describe('tokenFormChangedDto', () => {
  it('the cast event comes without the box', () => {
    const event = {
      campaignId: BASE.campaignId,
      sceneId: '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b',
      version: 4,
      at: '2026-10-27T12:00:00.000Z',
      tokenId: THOREN_ID,
      activeFormId: WOLF_ID,
      imageAssetId: null,
      frame: 'round',
    };

    expect(tokenFormChangedDto.parse(event)).toEqual(event);
  });
});
