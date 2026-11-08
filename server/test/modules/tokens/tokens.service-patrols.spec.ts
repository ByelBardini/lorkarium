import { beforeEach, describe, expect, it } from 'vitest';
import { TokenAppearanceService } from '../../../src/modules/tokens/token-appearance.service';
import { TokenFormService } from '../../../src/modules/tokens/token-form.service';
import { TokenVisibilityService } from '../../../src/modules/tokens/token-visibility.service';
import { TokensService, type UpdateToken } from '../../../src/modules/tokens/tokens.service';
import type { TokenRow } from '../../../src/modules/tokens/tokens.dao';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { CharacterTableFake } from '../../support/character-fakes';
import {
  DragGroupsFake,
  TableTokenRightsFake,
  TokenTransactionRunnerFake,
} from '../../support/tokens-fakes';
import {
  LYRA_ELF_FORM_ID,
  LYRA_ID,
  LYRA_PV_ID,
  LYRA_WOLF_FORM_ID,
  lyraForms,
  lyraPo,
  squarePatrolPo,
} from '../../support/tokens-factories';
import { SceneWallsFake, WallsDaoFake } from '../../support/walls-fakes';
import { northWallPo } from '../../support/walls-factories';

const STEP_2 = { tokenId: LYRA_ID, col: 2, row: 0, facing: 0, step: 2 };

/** Bia's Lyra walking the 2 × 2 square from (0, 0) for 2.5 s: she is on (2, 0) looking right. */
describe('token commands with a running patrol', () => {
  let table: CharacterTableFake;
  let walls: WallsDaoFake;
  let tokens: TokensService;
  let appearance: TokenAppearanceService;
  let form: TokenFormService;
  let visibility: TokenVisibilityService;

  beforeEach(() => {
    table = new CharacterTableFake();
    const startedAt = new Date(table.clock.now().getTime() - 2500);
    walk((row) => ({
      ...row,
      token: { ...row.token, col: 0, row: 0 },
      forms: lyraForms(),
      patrol: squarePatrolPo({ startedAt }),
    }));
    walls = new WallsDaoFake(table.journal);
    const { scenes, conditions, combat, characters, characterLinks } = table;
    const run = new TokenTransactionRunnerFake(
      scenes,
      table.tokens,
      conditions,
      combat,
      undefined,
      walls,
      characters,
      characterLinks,
    ).run;
    const { members, publisher, characterPublisher, clock } = table;
    const deps = { members, transaction: run, publisher, characterPublisher, clock };
    const limits = { barLimit: 99_999, tokenLimit: 500, blockerLimit: 50 };
    tokens = new TokensService({
      ...deps,
      ...limits,
      dragGroups: new DragGroupsFake(table.scenes, table.tokens),
      sceneWalls: new SceneWallsFake(),
      tokenRights: new TableTokenRightsFake(),
    });
    appearance = new TokenAppearanceService(deps);
    form = new TokenFormService(deps);
    visibility = new TokenVisibilityService(deps);
  });

  function walk(change: (row: TokenRow) => TokenRow): void {
    table.tokens.store(LYRA_ID, change);
  }

  const lyra = (): TokenRow => table.tokens.rowOf(LYRA_ID);
  const running = (): boolean => Boolean(lyra().patrol?.startedAt);

  describe('pause', () => {
    it('token:move pauses at step 2 and the event says where it stopped (the destination)', async () => {
      await tokens.move(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, col: 5, row: 5 });

      expect(table.publisher.tokenMoves[0]?.patrolPauses).toEqual([{ ...STEP_2, col: 5, row: 5 }]);
      expect(lyra().patrol).toMatchObject({ step: 2, startedAt: null });
      expect(lyra().token).toMatchObject({ col: 5, row: 5, facing: 0 });
    });

    it('token:moveMany pauses each running patrol in the one event', async () => {
      await tokens.moveMany(BIA_ID, VHARN_ID, { moves: [{ tokenId: LYRA_ID, col: 6, row: 6 }] });

      expect(table.publisher.tokensMoves[0]?.patrolPauses).toEqual([{ ...STEP_2, col: 6, row: 6 }]);
      expect(running()).toBe(false);
    });

    it('token:faceMany pauses on the cell of now with the new facing', async () => {
      await appearance.faceMany(BIA_ID, VHARN_ID, { faces: [{ tokenId: LYRA_ID, facing: 180 }] });

      expect(table.publisher.tokensFacings[0]?.patrolPauses).toEqual([{ ...STEP_2, facing: 180 }]);
      expect(lyra().token).toMatchObject({ col: 2, row: 0, facing: 180 });
    });

    it('a turn whose undo expects the facing of now (the patrol facing) is not STALE_UNDO', async () => {
      const face = { tokenId: LYRA_ID, facing: 90, expect: { facing: 0 } };

      await appearance.faceMany(BIA_ID, VHARN_ID, { faces: [face] });

      expect(lyra().token.facing).toBe(90);
    });

    it('token:resizeMany pauses with the box it saved', async () => {
      const resize = { tokenId: LYRA_ID, col: 2, row: 0, width: 2, height: 2 };

      await appearance.resizeMany(BIA_ID, VHARN_ID, { resizes: [resize] });

      expect(table.publisher.tokensResizes[0]?.patrolPauses).toEqual([STEP_2]);
      expect(running()).toBe(false);
    });

    it('token:setForm to a form of another size pauses and takes the box from the cell of now', async () => {
      await form.setForm(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, formId: LYRA_WOLF_FORM_ID });

      const event = table.publisher.tokenFormChanges[0];
      expect(event?.patrolPauses).toEqual([STEP_2]);
      expect(event?.box).toEqual({ col: 2, row: 0, width: 2, height: 2 });
    });

    it('token:update with a new size pauses, and the token:updated carries the paused patrol', async () => {
      const update = updateOf(lyra(), { width: 2, height: 2 });

      await tokens.update(ANA_ID, VHARN_ID, update);

      const sent = table.publisher.tokenChanges[0]?.privileged.token;
      expect(sent).toMatchObject({ col: 2, row: 0, facing: 0 });
      expect(sent?.patrol).toMatchObject({ step: 2, startedAt: null });
    });
  });

  describe('what does not pause', () => {
    it('token:setForm keeping the size leaves the patrol running and the stored corner', async () => {
      walk((row) => ({ ...row, token: { ...row.token, activeFormId: LYRA_WOLF_FORM_ID } }));

      await form.setForm(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, formId: LYRA_ELF_FORM_ID });

      expect(table.publisher.tokenFormChanges[0]).not.toHaveProperty('patrolPauses');
      expect(running()).toBe(true);
      expect(lyra().token).toMatchObject({ col: 0, row: 0 });
    });

    it('token:update keeping the size leaves the patrol running', async () => {
      await tokens.update(ANA_ID, VHARN_ID, updateOf(lyra(), { name: 'Lyra, a guarda' }));

      expect(running()).toBe(true);
    });

    it.each([
      [
        'setLayer',
        () => tokens.setLayer(ANA_ID, VHARN_ID, { tokenIds: [LYRA_ID], layer: 'objects' }),
      ],
      [
        'restyleMany',
        () =>
          appearance.restyleMany(BIA_ID, VHARN_ID, { tokenIds: [LYRA_ID], style: { flipX: true } }),
      ],
      [
        'setHiddenMany',
        () => visibility.setHiddenMany(ANA_ID, VHARN_ID, { tokenIds: [LYRA_ID], hidden: true }),
      ],
      [
        'adjustBar',
        () =>
          tokens.adjustBar(BIA_ID, VHARN_ID, {
            tokenId: LYRA_ID,
            barId: LYRA_PV_ID,
            change: { op: 'add', amount: -3 },
          }),
      ],
    ])('token:%s leaves the patrol running', async (_command, send) => {
      await send();

      expect(running()).toBe(true);
      expect(table.journal).not.toContain('pausePatrols');
    });

    it('token:dragMany neither pauses nor writes', async () => {
      const drags = [{ tokenId: LYRA_ID, cell: { col: 7, row: 7 } }];

      await tokens.dragMany(BIA_ID, VHARN_ID, { drags }, 'bia-socket');

      expect(running()).toBe(true);
      expect(lyra().token).toMatchObject({ col: 0, row: 0 });
    });

    it('a still token moves with the event as it always was, without patrolPauses', async () => {
      walk((row) => ({ ...row, patrol: null }));

      await tokens.move(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, col: 5, row: 5 });

      expect(table.publisher.tokenMoves[0]).not.toHaveProperty('patrolPauses');
      expect(table.journal).not.toContain('pausePatrols');
    });
  });

  describe('the origin of a move', () => {
    // Stored on (3, 4), below the north wall (2, 2)–(6, 2); 4 s into the walk back she is on (3, 0).
    beforeEach(() => {
      walls.rows.push(northWallPo());
      const route = {
        path: [
          [3, 0],
          [5, 0],
        ] as [number, number][],
        repeat: 'bounce' as const,
      };
      const startedAt = new Date(table.clock.now().getTime() - 4000);
      walk((row) => ({
        ...row,
        token: lyraPo({ col: 3, row: 4 }),
        patrol: squarePatrolPo({ ...route, startedAt }),
      }));
    });

    it('Bia moving her patrolling Lyra starts from the pose of now: the wall below is not crossed', async () => {
      await tokens.move(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, col: 4, row: 0 });

      expect(lyra().token).toMatchObject({ col: 4, row: 0 });
    });

    it('from the stored cell the same move would cross the wall: WALL_BLOCKED once paused', async () => {
      walk((row) => ({ ...row, patrol: row.patrol && { ...row.patrol, startedAt: null } }));

      const move = tokens.move(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, col: 4, row: 0 });

      await expect(move).rejects.toMatchObject({ code: 'WALL_BLOCKED' });
    });
  });
});

// A `token:update` that keeps everything of the row but `fields`.
function updateOf(
  row: TokenRow,
  fields: Partial<Pick<UpdateToken, 'name' | 'width' | 'height'>>,
): UpdateToken {
  const { name, initials, side, width, height } = row.token;
  const bars = row.bars.map(({ label, current, max, temp, color, visibility, display }) => ({
    ...{ label, current, max, temp, color, visibility, display },
  }));
  const base = { tokenId: row.token.id, name, initials, side, width, height };
  return { ...base, ...fields, controllerIds: [...row.controllerIds], bars };
}
