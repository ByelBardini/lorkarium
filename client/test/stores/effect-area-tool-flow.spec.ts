import { beforeEach, describe, expect, it } from 'vitest';
import type { EditEntry } from '@/lib/edit-history';
import { sendEffectArea } from '@/stores/effect-area-tool-flow';
import { VHARN } from '../support/campaigns-api-fake';
import { BIA_CONE_ID } from '../support/effect-area-fixtures';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';

const CONE = { kind: 'diagonal_cone', x: 6, y: 6, reach: 3, facing: 45, color: 'ember' } as const;

describe('sendEffectArea', () => {
  let commands: TableBoardCommandsFake;
  let recorded: EditEntry[];
  let notices: string[];

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    recorded = [];
    notices = [];
  });

  function send(readOnly = false): Promise<void> {
    const deps = {
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure: string) => `recusado: ${failure}`,
      recordEdit: (entry: EditEntry) => recorded.push(entry),
    };
    return sendEffectArea(deps, CONE, { readOnly, say: (notice) => notices.push(notice) });
  }

  it('the drawn area becomes one createEffectAreas with its shape', async () => {
    await send();
    expect(commands.sentAs('createEffectAreas').map(({ fields }) => fields)).toEqual([
      { effectAreas: [CONE] },
    ]);
  });

  it('confirmed, it goes on the undo stack by the id the server gave', async () => {
    commands.answerWith({ ok: true, version: 3, createdIds: [BIA_CONE_ID] });
    await send();
    expect(recorded).toEqual([
      [{ kind: 'effectAreasAdded', effectAreas: [{ id: BIA_CONE_ID, shape: CONE }] }],
    ]);
  });

  it('refused, the status line says why and nothing is recorded', async () => {
    commands.answerWith({ ok: false, failure: 'effect_area_limit' });
    await send();
    expect(notices).toEqual(['recusado: effect_area_limit']);
    expect(recorded).toEqual([]);
  });

  it('read only, nothing is sent', async () => {
    await send(true);
    expect(commands.sent).toEqual([]);
  });
});
