import { beforeEach, describe, expect, it } from 'vitest';
import type { EditEntry } from '@/lib/edit-history';
import type { LightColor } from '@/lib/light-color';
import { sendLight } from '@/stores/light-tool-flow';
import { VHARN } from '../support/campaigns-api-fake';
import { CORRIDOR_TORCH_ID } from '../support/light-fixtures';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';

const TORCH_REACH = { bright: 4, dim: 4 };

describe('sendLight', () => {
  let commands: TableBoardCommandsFake;
  let recorded: EditEntry[];
  let notices: string[];

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    recorded = [];
    notices = [];
  });

  function place(readOnly = false, color: LightColor = null, angle = 360) {
    return sendLight(
      {
        campaignId: VHARN.id,
        commands,
        describeRefusal: (failure) => `refused: ${failure}`,
        recordEdit: (entry) => recorded.push(entry),
      },
      { x: 5.5, y: 3 },
      { reach: TORCH_REACH, color, angle, readOnly, say: (notice) => notices.push(notice) },
    );
  }

  it('one click sends one createLights at the point with the remembered reach', async () => {
    await place();

    expect(commands.sentAs('createLights').map(({ fields }) => fields)).toEqual([
      { lights: [{ x: 5.5, y: 3, bright: 4, dim: 4, color: null, facing: 0, angle: 360 }] },
    ]);
  });

  it('confirmed, the light goes on the undo stack by the id the server gave', async () => {
    commands.answerWith({ ok: true, version: 2, createdIds: [CORRIDOR_TORCH_ID] });

    await place();

    expect(recorded).toEqual([
      [
        {
          kind: 'lightsAdded',
          lights: [
            {
              id: CORRIDOR_TORCH_ID,
              placement: { x: 5.5, y: 3, bright: 4, dim: 4, color: null, facing: 0, angle: 360 },
            },
          ],
        },
      ],
    ]);
  });

  it('an arcane light chosen in the panel goes in one createLights and on the stack with its color', async () => {
    commands.answerWith({ ok: true, version: 2, createdIds: [CORRIDOR_TORCH_ID] });

    await place(false, 'arcane');

    const placement = { x: 5.5, y: 3, bright: 4, dim: 4, color: 'arcane', facing: 0, angle: 360 };
    expect(commands.sentAs('createLights').map(({ fields }) => fields)).toEqual([
      { lights: [placement] },
    ]);
    expect(recorded).toEqual([
      [{ kind: 'lightsAdded', lights: [{ id: CORRIDOR_TORCH_ID, placement }] }],
    ]);
  });

  it('refused, the status line says why and nothing goes on the stack', async () => {
    commands.answerWith({ ok: false, failure: 'light_limit' });

    await place();

    expect(notices).toEqual(['refused: light_limit']);
    expect(recorded).toEqual([]);
  });

  it('read only, nothing is sent', async () => {
    await place(true);

    expect(commands.sent).toEqual([]);
  });

  it('a light placed with a remembered angle of 60 is born looking right with it, and goes so on the stack', async () => {
    commands.answerWith({ ok: true, version: 2, createdIds: [CORRIDOR_TORCH_ID] });

    await place(false, null, 60);

    const placement = { x: 5.5, y: 3, bright: 4, dim: 4, color: null, facing: 0, angle: 60 };
    expect(commands.sentAs('createLights').map(({ fields }) => fields)).toEqual([
      { lights: [placement] },
    ]);
    expect(recorded).toEqual([
      [{ kind: 'lightsAdded', lights: [{ id: CORRIDOR_TORCH_ID, placement }] }],
    ]);
  });
});
