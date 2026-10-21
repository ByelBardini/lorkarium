import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { VHARN } from '../support/campaigns-api-fake';
import { BRAZIER_ID, CORRIDOR_TORCH_ID, brazier, corridorTorch } from '../support/light-fixtures';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';

describe('the cone of map lights', () => {
  let commands: TableBoardCommandsFake;
  let recorded: EditEntry[];
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    recorded = [];
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
      recordEdit: (entry) => recorded.push(entry),
    });
  });

  describe('changeLightAngles', () => {
    it('two lights opened to 60 send one setLightCones keeping each facing and expecting each cone', async () => {
      const lights = [corridorTorch(), brazier({ facing: 90 })];

      await interaction.getState().changeLightAngles(lights, 60);

      expect(commands.sentAs('setLightCones').map(({ fields }) => fields)).toEqual([
        {
          changes: [
            { lightId: CORRIDOR_TORCH_ID, facing: 0, angle: 60, expect: { facing: 0, angle: 360 } },
            { lightId: BRAZIER_ID, facing: 90, angle: 60, expect: { facing: 90, angle: 360 } },
          ],
        },
      ]);
      expect(recorded).toEqual([
        [
          {
            kind: 'lightConesChanged',
            changes: [
              {
                lightId: CORRIDOR_TORCH_ID,
                from: { facing: 0, angle: 360 },
                to: { facing: 0, angle: 60 },
              },
              {
                lightId: BRAZIER_ID,
                from: { facing: 90, angle: 360 },
                to: { facing: 90, angle: 60 },
              },
            ],
          },
        ],
      ]);
    });

    it('only the lights whose angle changes are sent, and all already at 60 send nothing', async () => {
      await interaction.getState().changeLightAngles([corridorTorch({ angle: 60 }), brazier()], 60);
      await interaction.getState().changeLightAngles([corridorTorch({ angle: 60 })], 60);

      expect(commands.sentAs('setLightCones').map(({ fields }) => fields)).toEqual([
        {
          changes: [
            { lightId: BRAZIER_ID, facing: 0, angle: 60, expect: { facing: 0, angle: 360 } },
          ],
        },
      ]);
    });

    it('a refused angle says why and records nothing', async () => {
      commands.answerWith({ ok: false, failure: 'stale_undo' });

      await interaction.getState().changeLightAngles([corridorTorch()], 60);

      expect(interaction.getState().notice).toBe('recusado: stale_undo');
      expect(recorded).toEqual([]);
    });

    it('read only, nothing is sent', async () => {
      interaction.getState().setReadOnly(true);

      await interaction.getState().changeLightAngles([corridorTorch()], 60);

      expect(commands.sent).toEqual([]);
    });
  });

  describe('aimLight', () => {
    const SPOTLIGHT = corridorTorch({ facing: 0, angle: 60 });

    it('the handle being dragged keeps where the light would point, for this viewer', () => {
      interaction.getState().previewLightAim(CORRIDOR_TORCH_ID, 270);

      expect(interaction.getState().lightAimPreview).toEqual({ [CORRIDOR_TORCH_ID]: 270 });
    });

    it('released at 90, one setLightCones keeps the angle and expects the cone it had', async () => {
      await interaction.getState().aimLight(SPOTLIGHT, 90);

      expect(commands.sentAs('setLightCones').map(({ fields }) => fields)).toEqual([
        {
          changes: [
            { lightId: CORRIDOR_TORCH_ID, facing: 90, angle: 60, expect: { facing: 0, angle: 60 } },
          ],
        },
      ]);
    });

    it('confirmed, the aim goes on the undo stack and the preview is cleared', async () => {
      interaction.getState().previewLightAim(CORRIDOR_TORCH_ID, 90);

      await interaction.getState().aimLight(SPOTLIGHT, 90);

      expect(recorded).toEqual([
        [
          {
            kind: 'lightConesChanged',
            changes: [
              {
                lightId: CORRIDOR_TORCH_ID,
                from: { facing: 0, angle: 60 },
                to: { facing: 90, angle: 60 },
              },
            ],
          },
        ],
      ]);
      expect(interaction.getState().lightAimPreview).toEqual({});
    });

    it('refused, the light points back and the status line says why', async () => {
      commands.answerWith({ ok: false, failure: 'light_not_found' });

      await interaction.getState().aimLight(SPOTLIGHT, 90);

      expect(interaction.getState().lightAimPreview).toEqual({});
      expect(interaction.getState().notice).toBe('recusado: light_not_found');
      expect(recorded).toEqual([]);
    });

    it('released where it already points, nothing is sent', async () => {
      await interaction.getState().aimLight(SPOTLIGHT, 0);

      expect(commands.sent).toEqual([]);
    });
  });
});
