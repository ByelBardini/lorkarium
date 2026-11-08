import { describe, expect, it } from 'vitest';
import {
  pausePatrolsOf,
  pausedIfOf,
  pausedRowsOf,
  posedNowOf,
  withPatrolPauses,
} from '../../../src/modules/tokens/token-patrol-pause';
import type { TokenRow } from '../../../src/modules/tokens/tokens.dao';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import {
  BRAM_ID,
  LYRA_ID,
  bramRow,
  lyraPo,
  lyraRow,
  squarePatrolPo,
} from '../../support/tokens-factories';

const STARTED = new Date('2026-11-08T12:00:00.000Z');
const NOW = new Date('2026-11-08T12:00:02.500Z');

function walkingLyra(startedAt: Date | null = STARTED): TokenRow {
  return lyraRow({ token: lyraPo({ col: 0, row: 0 }), patrol: squarePatrolPo({ startedAt }) });
}

describe('token-patrol-pause', () => {
  it('posedNowOf puts a running patrol on the cell of now and keeps the step to resume from', () => {
    const posed = posedNowOf([walkingLyra(), bramRow()], NOW);

    expect(posed.rows[0]?.token).toMatchObject({ col: 2, row: 0, facing: 0 });
    expect(posed.rows[1]).toEqual(bramRow());
    expect([...posed.steps]).toEqual([[LYRA_ID, 2]]);
  });

  it('posedNowOf leaves a paused patrol where it is stored, with no step', () => {
    const posed = posedNowOf([walkingLyra(null)], NOW);

    expect(posed.rows[0]?.token).toMatchObject({ col: 0, row: 0 });
    expect(posed.steps.size).toBe(0);
  });

  it('pausePatrolsOf saves the pose the command left with the step, and only of the running ones', async () => {
    const journal: string[] = [];
    const tokens = new TokensDaoFake(journal, [walkingLyra(), bramRow()]);
    const moved = { token: lyraPo({ col: 5, row: 5, facing: 90 }) };

    const pauses = await pausePatrolsOf({ tokens }, VHARN_SCENE_ID, new Map([[LYRA_ID, 2]]), [
      moved,
      bramRow(),
    ]);

    expect(pauses).toEqual([{ tokenId: LYRA_ID, col: 5, row: 5, facing: 90, step: 2 }]);
    expect(tokens.rowOf(LYRA_ID).patrol).toMatchObject({ step: 2, startedAt: null });
    expect(journal).toEqual(['pausePatrols']);
  });

  it('pausePatrolsOf writes nothing when no patrol runs', async () => {
    const journal: string[] = [];
    const tokens = new TokensDaoFake(journal, [bramRow()]);

    expect(await pausePatrolsOf({ tokens }, VHARN_SCENE_ID, new Map(), [bramRow()])).toEqual([]);
    expect(journal).toEqual([]);
  });

  it('pausedRowsOf stops the patrols of the pauses and leaves the rest', () => {
    const pause = { tokenId: LYRA_ID, col: 2, row: 0, facing: 0, step: 2 };

    const [lyra, bram] = pausedRowsOf([walkingLyra(), bramRow()], [pause]);

    expect(lyra?.patrol).toMatchObject({ step: 2, startedAt: null });
    expect(bram?.token.id).toBe(BRAM_ID);
  });

  it('withPatrolPauses adds them, and leaves the event as it was without any', () => {
    const pause = { tokenId: LYRA_ID, col: 2, row: 0, facing: 0, step: 2 };

    expect(withPatrolPauses({ tokenId: LYRA_ID }, [pause])).toEqual({
      tokenId: LYRA_ID,
      patrolPauses: [pause],
    });
    expect(withPatrolPauses({ tokenId: LYRA_ID }, [])).toEqual({ tokenId: LYRA_ID });
  });

  it('pausedIfOf pauses only when the command touches the box', async () => {
    const tokens = new TokensDaoFake([], [walkingLyra()]);

    const kept = await pausedIfOf({ tokens }, VHARN_SCENE_ID, walkingLyra(), NOW, false);
    const touched = await pausedIfOf({ tokens }, VHARN_SCENE_ID, walkingLyra(), NOW, true);

    expect(kept).toEqual({ row: walkingLyra(), patrolPauses: [] });
    expect(touched.row.token).toMatchObject({ col: 2, row: 0 });
    expect(touched.row.patrol?.startedAt).toBeNull();
    expect(touched.patrolPauses).toEqual([
      { tokenId: LYRA_ID, col: 2, row: 0, facing: 0, step: 2 },
    ]);
  });
});
