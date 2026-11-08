import { describe, expect, it } from 'vitest';
import { cell } from '@lorkarium/game-core';
import {
  toPatrolChangeDto,
  toPatrolledToken,
  toPatrolTimeline,
  toTokenPatrol,
  toTokenPatrolDto,
  toTokenPatrolPo,
  withPatrolWrite,
} from '../../../src/modules/tokens/token-patrol.mapper';
import { toTokenDto } from '../../../src/modules/tokens/tokens.mapper';
import { LYRA_ID, lyraPo, lyraRow, squarePatrolPo } from '../../support/tokens-factories';

const STARTED = new Date('2026-11-08T12:00:00.000Z');

describe('token-patrol.mapper', () => {
  it('a stored patrol goes out with the numeric as a number and the instant as ISO', () => {
    const stored = squarePatrolPo({ speed: '1.50', step: 3, startedAt: STARTED });

    expect(toTokenPatrolDto(stored)).toEqual({
      path: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      repeat: 'loop',
      speed: 1.5,
      turns: true,
      step: 3,
      startedAt: '2026-11-08T12:00:00.000Z',
    });
  });

  it('a paused patrol goes out with startedAt null', () => {
    expect(toTokenPatrolDto(squarePatrolPo()).startedAt).toBeNull();
  });

  it('every audience of the token gets its patrol; a token without one gets null', () => {
    const row = lyraRow({ patrol: squarePatrolPo({ startedAt: STARTED }) });

    expect(toTokenDto(row, 'others').patrol?.startedAt).toBe('2026-11-08T12:00:00.000Z');
    expect(toTokenDto(row, 'privileged').patrol).toEqual(toTokenDto(row, 'others').patrol);
    expect(toTokenDto(lyraRow(), 'others').patrol).toBeNull();
  });

  it('the jsonb path becomes cells of the game-core patrol, with the speed as a number', () => {
    const timeline = toPatrolTimeline(squarePatrolPo({ speed: '0.25', step: 1 }));

    expect(timeline.patrol.path).toEqual([cell(0, 0), cell(2, 0), cell(2, 2), cell(0, 2)]);
    expect(timeline.patrol.speed).toBe(0.25);
    expect(timeline.step).toBe(1);
  });

  it('a patrol saved broken throws citing the token', () => {
    expect(() => toPatrolTimeline(squarePatrolPo({ speed: '0.30' }))).toThrow(
      `token ${LYRA_ID} has a patrol saved broken`,
    );
  });

  it('a route that never leaves its first cell is INVALID_TOKEN_PATROL citing the token', () => {
    const fields = {
      path: [
        [1, 1],
        [1, 1],
      ] as [number, number][],
      repeat: 'loop' as const,
      speed: 1,
      turns: true,
    };

    expect(() => toTokenPatrol(LYRA_ID, fields)).toThrow(
      expect.objectContaining({
        code: 'INVALID_TOKEN_PATROL',
        message: expect.stringContaining(`the patrol of token ${LYRA_ID} is invalid`),
      }),
    );
  });

  it('a timeline goes to the row with the speed to the hundredth', () => {
    const timeline = toPatrolTimeline(squarePatrolPo({ speed: '1.50' }));

    expect(toTokenPatrolPo(LYRA_ID, { ...timeline, startedAt: STARTED })).toEqual(
      squarePatrolPo({ speed: '1.50', startedAt: STARTED }),
    );
  });

  it('a write becomes the change of the event with its pose', () => {
    const timeline = toPatrolTimeline(squarePatrolPo());
    const write = { tokenId: LYRA_ID, timeline, pose: { col: 2, row: 0, facing: 0 } };

    expect(toPatrolChangeDto(write)).toMatchObject({
      tokenId: LYRA_ID,
      col: 2,
      row: 0,
      facing: 0,
      patrol: { speed: 1, step: 0, startedAt: null },
    });
    expect(toPatrolChangeDto({ ...write, timeline: null }).patrol).toBeNull();
  });

  it('a saved token becomes what the rule reads, and the write lands back on the row', () => {
    const row = lyraRow({
      token: lyraPo({ col: 1, row: 2, facing: 45 }),
      patrol: squarePatrolPo(),
    });
    const token = toPatrolledToken(row);
    const write = { tokenId: LYRA_ID, timeline: null, pose: { col: 2, row: 0, facing: 0 } };

    expect(token).toMatchObject({
      pose: { col: 1, row: 2, facing: 45 },
      size: { width: 1, height: 1 },
    });
    expect(withPatrolWrite(row, write).token).toMatchObject({ col: 2, row: 0, facing: 0 });
    expect(withPatrolWrite(row, write).patrol).toBeNull();
  });
});
