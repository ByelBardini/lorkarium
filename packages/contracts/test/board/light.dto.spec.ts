import { describe, expect, it } from 'vitest';
import {
  createLightsCommandDto,
  deleteLightsCommandDto,
  lightRangeDto,
  lightsLitChangedDto,
  setLightsLitCommandDto,
} from '../../src/board/light.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const TORCH_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const BRAZIER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const BASE = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID };
const TORCH = { x: 5.5, y: 3, bright: 4, dim: 4 };

function messagesOf(input: unknown): string[] {
  return lightRangeDto.safeParse(input).error?.issues.map((issue) => issue.message) ?? [];
}

describe('lightRangeDto', () => {
  it('a torch of bright 4 and dim 4 is accepted as sent', () => {
    expect(lightRangeDto.parse({ bright: 4, dim: 4 })).toEqual({ bright: 4, dim: 4 });
  });

  it.each([
    ['bright', 101],
    ['dim', -0.5],
    ['bright', Number.NaN],
  ])('a %s of %s is refused citing the value and 0 to 100 cells', (side, value) => {
    expect(messagesOf({ bright: 4, dim: 4, [side]: value })).toEqual([
      `light ${side} ${value} is invalid; expected 0 to 100 cells`,
    ]);
  });

  it('a light without dim is refused on dim', () => {
    const result = lightRangeDto.safeParse({ bright: 4 });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['dim']);
  });

  it('a field besides bright and dim is refused', () => {
    expect(lightRangeDto.safeParse({ bright: 4, dim: 4, color: 'amber' }).success).toBe(false);
  });
});

describe('createLightsCommandDto', () => {
  it('a wall torch at (5.5, 3) with bright 4 and dim 4 is accepted as sent', () => {
    const command = { ...BASE, lights: [TORCH] };
    expect(createLightsCommandDto.parse(command)).toEqual(command);
  });

  it('64 lights in one command are accepted', () => {
    const command = { ...BASE, lights: Array.from({ length: 64 }, () => TORCH) };
    expect(createLightsCommandDto.safeParse(command).success).toBe(true);
  });

  it('65 lights in one command are refused', () => {
    const command = { ...BASE, lights: Array.from({ length: 65 }, () => TORCH) };
    expect(createLightsCommandDto.safeParse(command).success).toBe(false);
  });

  it('a light at x -1 is refused on its x', () => {
    const result = createLightsCommandDto.safeParse({ ...BASE, lights: [{ ...TORCH, x: -1 }] });
    expect(
      result.error?.issues.map((issue: { path: PropertyKey[] }) => issue.path.join('.')),
    ).toEqual(['lights.0.x']);
  });

  it('a light sent lit or unlit is refused: a new light is always lit', () => {
    const command = { ...BASE, lights: [{ ...TORCH, lit: false }] };
    expect(createLightsCommandDto.safeParse(command).success).toBe(false);
  });
});

describe('setLightsLitCommandDto', () => {
  it('the same light twice is refused citing its id', () => {
    const command = { ...BASE, lightIds: [TORCH_ID, TORCH_ID], lit: false };
    const result = setLightsLitCommandDto.safeParse(command);
    expect(result.error?.issues.map((issue: { message: string }) => issue.message)).toEqual([
      `light ${TORCH_ID} appears more than once; expected distinct light ids`,
    ]);
  });
});

describe('deleteLightsCommandDto', () => {
  it('an expectation for a light the command does not delete is refused citing it', () => {
    const command = {
      ...BASE,
      lightIds: [TORCH_ID],
      expect: [{ lightId: BRAZIER_ID, x: 1, y: 1 }],
    };
    const result = deleteLightsCommandDto.safeParse(command);
    expect(result.error?.issues.map((issue: { message: string }) => issue.message)).toEqual([
      `light ${BRAZIER_ID} is not being deleted; expected only ids in lightIds`,
    ]);
  });
});

describe('lightsLitChangedDto', () => {
  it('a lit of "yes" is refused on lit', () => {
    const event = {
      campaignId: CAMPAIGN_ID,
      version: 3,
      at: '2026-10-18T12:00:00.000Z',
      lightIds: [TORCH_ID],
      lit: 'yes',
    };
    const result = lightsLitChangedDto.safeParse(event);
    expect(
      result.error?.issues.map((issue: { path: PropertyKey[] }) => issue.path.join('.')),
    ).toEqual(['lit']);
  });
});
