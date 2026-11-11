import { act, render } from '@testing-library/react';
import { Profiler } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSheetHolderNames } from '@/features/library/use-sheet-holder-names';
import type { OpenTable } from '@/stores/open-tables-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { RenderCounter } from '../../support/render-counter';
import { openVharnTabs } from '../../support/scene-tabs-harness';
import { TableSessionApiFake } from '../../support/table-session-api-fake';
import {
  LYRA_ID,
  lyra,
  tokenMovedAt,
  tokenUpdatedAt,
  vharnBoard,
} from '../../support/table-session-fixtures';

type HolderProbeProps = Readonly<{ table: OpenTable; named: (string | null)[] }>;

// Writes down the name the library gives Lyra's sheet holder, at each render.
function HolderProbe({ table, named }: HolderProbeProps): null {
  const { names } = useSheetHolderNames([], table);
  named.push(names.tokenName(LYRA_ID));
  return null;
}

describe('useSheetHolderNames', () => {
  let api: TableSessionApiFake;
  let renders: RenderCounter;
  let named: (string | null)[];

  beforeEach(() => {
    api = new TableSessionApiFake();
    const table = openVharnTabs(api);
    act(() => api.emitTo(VHARN.id, { kind: 'board', state: vharnBoard({ tokens: [lyra()] }) }));
    renders = new RenderCounter();
    named = [];
    render(
      <Profiler id="donos" onRender={renders.onRender}>
        <HolderProbe table={table} named={named} />
      </Profiler>,
    );
    renders.count = 0;
  });

  it('names the token of the group grid', () => {
    expect(named).toEqual(['Lyra']);
  });

  it('Lyra moved on the board renders nothing', () => {
    act(() =>
      api.emitTo(VHARN.id, { kind: 'boardEvent', event: tokenMovedAt(5, { col: 9, row: 6 }) }),
    );

    expect(renders.count).toBe(0);
  });

  it('Lyra renamed renders once, with the new name', () => {
    const renamed = tokenUpdatedAt(5, lyra({ name: 'Lyra, a Velha' }));

    act(() => api.emitTo(VHARN.id, { kind: 'boardEvent', event: renamed }));

    expect(renders.count).toBe(1);
    expect(named.at(-1)).toBe('Lyra, a Velha');
  });
});
