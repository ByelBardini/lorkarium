import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { copiedOf } from '@/lib/paste-placement';
import type { OpenTable } from '@/stores/open-tables-store';
import {
  GROUP_TAB,
  groupTabOf,
  visibleTabOf,
  type SceneTab,
  type SceneTabsStore,
} from '@/stores/scene-tabs-store';
import { SCENE_TABS_STORAGE_PREFIX } from '@/stores/scene-tabs-storage';
import { VHARN } from '../support/campaigns-api-fake';
import {
  ESTRADA_SCENE,
  TORRE_SCENE,
  estradaBoard,
  libraryChanged,
  torreBoard,
  sceneActivated,
  sceneClosed,
} from '../support/scene-tab-fixtures';
import { openTorreTab, openVharnTabs } from '../support/scene-tabs-harness';
import { StorageFake } from '../support/storage-fake';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { TableSessionApiFake } from '../support/table-session-api-fake';
import {
  LYRA_ID,
  VHARN_SCENE,
  boardPinged,
  lyra,
  memberCard,
  vharnBoard,
} from '../support/table-session-fixtures';
import { VHARN_CAST_ID, anchorUpdatedAt, castBoard, linkedLyra } from '../support/cast-fixtures';
import type { GridUpdate } from '@/services/table-session-api';

const TABS_KEY = `${SCENE_TABS_STORAGE_PREFIX}${VHARN.id}`;
const TORRE_WATCH = `${VHARN.id}:${TORRE_SCENE.id}`;

describe('scene tabs store', () => {
  let api: TableSessionApiFake;
  let storage: StorageFake;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    api = new TableSessionApiFake();
    storage = new StorageFake();
    commands = new TableBoardCommandsFake();
  });

  function openVharn(tabStorage: StorageFake = storage): OpenTable {
    return openVharnTabs(api, tabStorage, commands);
  }

  function tabsOf(table: OpenTable): StoreApi<SceneTabsStore> {
    return table.tabs;
  }

  function keys(table: OpenTable): string[] {
    return tabsOf(table)
      .getState()
      .tabs.map(({ key }) => key);
  }

  function visible(table: OpenTable): SceneTab {
    return visibleTabOf(tabsOf(table).getState());
  }

  function openTorre(table: OpenTable): SceneTab {
    openTorreTab(api, table);
    return visible(table);
  }

  it('opens with the group grid tab alone and shown, over the table board', () => {
    const table = openVharn();
    expect(keys(table)).toEqual([GROUP_TAB]);
    expect(visible(table).board).toBe(table.board);
    expect(visible(table).edits).toBe(table.edits);
  });

  it('open(torre) watches it and shows a tab with its own board, interaction and undo stack', () => {
    const table = openVharn();
    const torre = openTorre(table);
    const group = groupTabOf(tabsOf(table).getState());
    expect(api.watched).toEqual([TORRE_WATCH]);
    expect(keys(table)).toEqual([GROUP_TAB, TORRE_SCENE.id]);
    expect(torre.board.getState().board?.scene.name).toBe('Torre');
    expect(torre.board).not.toBe(group.board);
    expect(torre.interaction).not.toBe(group.interaction);
    expect(torre.edits).not.toBe(group.edits);
  });

  it('opening an open grid again only shows it, without a second watch', () => {
    const table = openVharn();
    openTorre(table);
    tabsOf(table).getState().show(GROUP_TAB);
    tabsOf(table).getState().open(TORRE_SCENE.id);
    expect(visible(table).key).toBe(TORRE_SCENE.id);
    expect(api.watched).toEqual([TORRE_WATCH]);
  });

  it('opening the group grid from the library shows the group tab, never a copy of it', () => {
    const table = openVharn();
    tabsOf(table).getState().open(VHARN_SCENE.id);
    expect(keys(table)).toEqual([GROUP_TAB]);
    expect(api.watched).toEqual([]);
  });

  it('close(torre) unwatches it and goes back to the group tab; the group tab never closes', () => {
    const table = openVharn();
    openTorre(table);
    tabsOf(table).getState().close(TORRE_SCENE.id);
    tabsOf(table).getState().close(GROUP_TAB);
    expect(api.unwatched).toEqual([TORRE_WATCH]);
    expect(keys(table)).toEqual([GROUP_TAB]);
    expect(visible(table).key).toBe(GROUP_TAB);
  });

  it('each tab sends its commands to its own grid', async () => {
    const table = openVharn();
    const torre = openTorre(table);
    const group = groupTabOf(tabsOf(table).getState());
    await torre.interaction.getState().command((sent, scope) => sent.deleteToken(scope, 'x'));
    await group.interaction.getState().command((sent, scope) => sent.deleteToken(scope, 'y'));
    expect(commands.sent.map(({ sceneId }) => sceneId)).toEqual([TORRE_SCENE.id, VHARN_SCENE.id]);
  });

  describe('the master taking the group elsewhere', () => {
    it('the group tab becomes the Estrada, is shown, and the arrival is announced', () => {
      const table = openVharn();
      openTorre(table);
      api.emitTo(VHARN.id, { kind: 'sceneActivated', event: sceneActivated() });
      expect(visible(table).key).toBe(GROUP_TAB);
      expect(tabsOf(table).getState().notice).toBeNull();
      api.emitTo(VHARN.id, { kind: 'board', state: estradaBoard() });
      expect(visible(table).board.getState().board?.scene.id).toBe(ESTRADA_SCENE.id);
      expect(tabsOf(table).getState().notice).toBe('O mestre levou o grupo para Estrada de Vharn.');
    });

    it('an extra tab of the grid the group went to closes: the group tab shows it', () => {
      const table = openVharn();
      openTorre(table);
      api.emitTo(VHARN.id, {
        kind: 'sceneActivated',
        event: sceneActivated({ sceneId: TORRE_SCENE.id }),
      });
      expect(keys(table)).toEqual([GROUP_TAB]);
      expect(api.unwatched).toEqual([TORRE_WATCH]);
    });
  });

  it.each([
    ['private', 'Torre ficou privada.'],
    ['deleted', 'Torre foi excluída.'],
  ] as const)('scene:closed (%s) closes the tab and says "%s"', (reason, notice) => {
    const table = openVharn();
    openTorre(table);
    api.emitTo(VHARN.id, { kind: 'sceneClosed', event: sceneClosed(reason) });
    expect(keys(table)).toEqual([GROUP_TAB]);
    expect(visible(table).key).toBe(GROUP_TAB);
    expect(tabsOf(table).getState().notice).toBe(notice);
  });

  it('library:changed grows the library revision', () => {
    const table = openVharn();
    api.emitTo(VHARN.id, { kind: 'libraryChanged', event: libraryChanged() });
    expect(tabsOf(table).getState().libraryRevision).toBe(1);
  });

  describe('after an F5', () => {
    it('the tabs remembered for the table come back, the shown one too', () => {
      openTorre(openVharn());
      expect(JSON.parse(storage.values.get(TABS_KEY) ?? 'null')).toEqual({
        sceneIds: [TORRE_SCENE.id],
        visible: TORRE_SCENE.id,
      });
      api = new TableSessionApiFake();
      const reopened = openVharn();
      expect(api.watched).toEqual([TORRE_WATCH]);
      expect(visible(reopened).key).toBe(TORRE_SCENE.id);
    });

    it('a remembered tab the server refuses (not found) goes away', () => {
      openTorre(openVharn());
      api = new TableSessionApiFake();
      const reopened = openVharn();
      api.emitToGrid(TORRE_SCENE.id, { kind: 'boardFailed', failure: 'not_found' });
      expect(keys(reopened)).toEqual([GROUP_TAB]);
    });

    it('a storage that throws keeps the tabs in memory', () => {
      const table = openVharn(new StorageFake(true));
      openTorre(table);
      expect(keys(table)).toEqual([GROUP_TAB, TORRE_SCENE.id]);
    });
  });

  it('the copy area is the table one (copy on a grid, paste on another); the undo stack is the tab one', () => {
    const table = openVharn();
    const torre = openTorre(table);
    const group = groupTabOf(tabsOf(table).getState());
    group.edits.getState().copy(copiedOf([lyra()], []));
    group.edits.getState().record([{ kind: 'tokensMoved', moves: [] }]);
    expect(torre.edits.getState().copied?.tokens).toHaveLength(1);
    expect(torre.edits.getState().history.past).toEqual([]);
    expect(group.edits.getState().history.past).toHaveLength(1);
  });

  describe('the cast', () => {
    function castEvent(version: number, pv: number): GridUpdate {
      return { kind: 'boardEvent', event: anchorUpdatedAt(version, pv) };
    }

    function lyraPvOf(tab: SceneTab): number | undefined {
      const lyraToken = tab.board.getState().board?.tokens.find(({ id }) => id === LYRA_ID);
      return lyraToken?.bars[0]?.current;
    }

    it('the open table follows its cast (board:sync of castSceneId) and applies its events', () => {
      const table = openVharn();
      expect(api.castFollowed).toEqual([`${VHARN.id}:${VHARN_CAST_ID}`]);
      api.emitToCast(VHARN.id, { kind: 'board', state: castBoard() }, castEvent(4, 20));
      expect(table.cast.getState().board?.tokens[0]?.bars[0]?.current).toBe(20);
      expect(table.board.getState().board?.scene.id).toBe(VHARN_SCENE.id);
    });

    it('a linked Lyra shows the anchor PV in the group tab and in an extra tab, and follows it', () => {
      const table = openVharn();
      api.emitTo(VHARN.id, { kind: 'board', state: vharnBoard({ tokens: [linkedLyra()] }) });
      table.tabs.getState().open(TORRE_SCENE.id);
      api.emitToGrid(TORRE_SCENE.id, {
        kind: 'board',
        state: torreBoard({ tokens: [linkedLyra({ col: 9 })] }),
      });
      const group = groupTabOf(tabsOf(table).getState());
      expect(lyraPvOf(group)).toBe(32);
      api.emitToCast(VHARN.id, { kind: 'board', state: castBoard() });
      expect(lyraPvOf(group)).toBe(25);
      api.emitToCast(VHARN.id, castEvent(4, 18));
      expect(lyraPvOf(group)).toBe(18);
      expect(lyraPvOf(visible(table))).toBe(18);
      expect(visible(table).board.getState().board?.tokens[0]?.col).toBe(9);
    });

    it('the cards and the conditions defined of every tab are the cast ones', () => {
      const table = openVharn();
      const card = memberCard({ armorClass: 16 });
      api.emitToCast(VHARN.id, { kind: 'board', state: castBoard({ memberCards: [card] }) });
      expect(table.board.getState().board?.memberCards).toEqual([card]);
    });
  });

  describe('pings', () => {
    function heardBy(tab: SceneTab): number[] {
      const heard: number[] = [];
      tab.pings.subscribe((ping) => heard.push(ping.x));
      return heard;
    }

    it("a ping of the group grid reaches the group tab's feed, not the Torre's", () => {
      const table = openVharn();
      const torre = heardBy(openTorre(table));
      const group = heardBy(groupTabOf(tabsOf(table).getState()));

      api.emitTo(VHARN.id, { kind: 'pinged', event: boardPinged({ x: 4 }) });

      expect([group, torre]).toEqual([[4], []]);
    });

    it("a ping of the Torre reaches only the Torre tab's feed and leaves its board as it was", () => {
      const table = openVharn();
      const torreTab = openTorre(table);
      const [torre, group] = [heardBy(torreTab), heardBy(groupTabOf(tabsOf(table).getState()))];
      const boardBefore = torreTab.board.getState();

      api.emitToGrid(TORRE_SCENE.id, {
        kind: 'pinged',
        event: boardPinged({ sceneId: TORRE_SCENE.id, x: 7 }),
      });

      expect([torre, group]).toEqual([[7], []]);
      expect(torreTab.board.getState()).toBe(boardBefore);
    });
  });
});
