import type { SessionMemberDto } from '@lorkarium/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { followViewerRole } from '@/features/board/use-viewer-role';
import type { OpenTable } from '@/stores/open-tables-store';
import { groupTabOf, visibleTabOf } from '@/stores/scene-tabs-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { VHARN_CAST_ID } from '../../support/cast-fixtures';
import { TORRE_SCENE } from '../../support/scene-tab-fixtures';
import { openTorreTab, openVharnTabs } from '../../support/scene-tabs-harness';
import { TableSessionApiFake } from '../../support/table-session-api-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  biaUpdated,
  duda,
  vharnState,
} from '../../support/table-session-fixtures';

/** The router's revalidation as the test sees it: how many times the campaign was read again. */
class RouteRevalidationFake {
  count = 0;

  readonly revalidate = (): void => {
    this.count += 1;
  };
}

// What the stores asked of the session since the test began: the group grid's sync (by table),
// each extra tab's and the cast's.
type Resyncs = Readonly<{ group: string[]; tabs: string[]; cast: string[] }>;

describe('followViewerRole', () => {
  let api: TableSessionApiFake;
  let table: OpenTable;
  let revalidation: RouteRevalidationFake;
  let stop: () => void = () => undefined;
  let before: Resyncs;

  beforeEach(() => {
    api = new TableSessionApiFake();
    table = openVharnTabs(api);
    openTorreTab(api, table);
    revalidation = new RouteRevalidationFake();
    before = resyncs();
  });

  afterEach(() => stop());

  function resyncs(): Resyncs {
    return { group: [...api.resyncedIds], tabs: [...api.watchResyncs], cast: [...api.castResyncs] };
  }

  function resyncsSinceStart(): Resyncs {
    const now = resyncs();
    return {
      group: now.group.slice(before.group.length),
      tabs: now.tabs.slice(before.tabs.length),
      cast: now.cast.slice(before.cast.length),
    };
  }

  function followAs(viewerId: string): void {
    const { presence, tabs, cast } = table;
    stop = followViewerRole({
      presence,
      tabs,
      cast,
      viewerId,
      revalidate: revalidation.revalidate,
    });
  }

  // The viewer always has the table open (their own connection), so the roster lists them online.
  function biaOnline(): void {
    const members = [ANA_AT_TABLE, { ...BIA_AT_TABLE, online: true }, CAIO_AT_TABLE];
    api.emitTo(VHARN.id, { kind: 'state', state: vharnState({ members }) });
  }

  function memberUpdated(member: SessionMemberDto, version = 2): void {
    api.emitTo(VHARN.id, { kind: 'memberUpdated', event: biaUpdated({ member, version }) });
  }

  it('Bia demoted live: every open grid and the cast ask their snapshot, and the route is read again', () => {
    biaOnline();
    followAs(BIA_AT_TABLE.userId);
    memberUpdated({ ...BIA_AT_TABLE, role: 'spectator' });

    expect(resyncsSinceStart()).toEqual({
      group: [VHARN.id],
      tabs: [`${VHARN.id}:${TORRE_SCENE.id}`],
      cast: [`${VHARN.id}:${VHARN_CAST_ID}`],
    });
    expect(revalidation.count).toBe(1);
  });

  it('Bia demoted live: the status line says so, and the tools drop back to Selecionar', () => {
    biaOnline();
    groupTabOf(table.tabs.getState()).interaction.getState().setTool('draw');
    followAs(BIA_AT_TABLE.userId);
    memberUpdated({ ...BIA_AT_TABLE, role: 'spectator' });

    const shown = visibleTabOf(table.tabs.getState()).interaction.getState();
    expect(shown.notice).toBe('Agora você assiste a esta mesa.');
    expect(groupTabOf(table.tabs.getState()).interaction.getState().tool).toBe('select');
  });

  it('Duda promoted live hears "Agora você é jogador nesta mesa."', () => {
    const members = [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE, duda()];
    api.emitTo(VHARN.id, { kind: 'state', state: vharnState({ members }) });
    followAs(duda().userId);
    memberUpdated(duda({ role: 'player' }));

    const shown = visibleTabOf(table.tabs.getState()).interaction.getState();
    expect(shown.notice).toBe('Agora você é jogador nesta mesa.');
    expect(revalidation.count).toBe(1);
  });

  it('a new profile of Bia with the same role asks nothing', () => {
    followAs(BIA_AT_TABLE.userId);
    memberUpdated({ ...BIA_AT_TABLE, name: 'Bia Rosa' });

    expect(resyncsSinceStart()).toEqual({ group: [], tabs: [], cast: [] });
    expect(revalidation.count).toBe(0);
  });

  it("another member's role changing asks nothing of Bia's room", () => {
    followAs(BIA_AT_TABLE.userId);
    memberUpdated({ ...CAIO_AT_TABLE, role: 'spectator' });

    expect(resyncsSinceStart()).toEqual({ group: [], tabs: [], cast: [] });
    expect(revalidation.count).toBe(0);
  });

  it('once stopped, a demotion asks nothing', () => {
    followAs(BIA_AT_TABLE.userId);
    stop();
    memberUpdated({ ...BIA_AT_TABLE, role: 'spectator' });

    expect(revalidation.count).toBe(0);
  });
});
