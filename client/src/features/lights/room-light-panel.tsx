import type { LightDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import type { SceneDistance } from '@/lib/range-form';
import type { LightReach } from '@/services/light-commands';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { lightReachOf, useLightReach, type LightReachStore } from '@/stores/light-reach-store';
import { LightPanel } from './light-panel';

export type RoomLightPanelProps = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  lightReach: StoreApi<LightReachStore>;
}>;

const NO_LIGHTS: readonly LightDto[] = [];

/** The lights panel of the room: with lights picked, their reach (one command per field left, on
 *  the undo stack); with none, the reach of the next light, remembered in the browser. Typed in
 *  the unit of the scene.
 *
 *  Example: `<RoomLightPanel board={table.board} interaction={interaction} lightReach={deps.lightReach} />` */
export function RoomLightPanel(props: RoomLightPanelProps): React.JSX.Element | null {
  const { board, interaction, lightReach } = props;
  const scene = useBoard(board, (state) => state.board?.scene ?? null);
  const lights = useBoard(board, (state) => state.board?.lights ?? NO_LIGHTS);
  const selectedIds = useBoardInteraction(interaction, (state) => state.selectedLightIds);
  if (!scene) return null;
  const distance = { cellDistance: scene.cellDistance, cellUnit: scene.cellUnit };
  const picked = lights.filter(({ id }) => selectedIds.includes(id));
  if (picked.length === 0) return <NextLightPanel lightReach={lightReach} distance={distance} />;
  const local = interaction.getState();
  const change = (reach: LightReach): void => void local.changeLightRanges(picked, reach);
  // All lit: put them out; any out: light them all.
  const allLit = picked.every(({ lit }) => lit);
  return (
    <LightPanel
      key={selectedIds.join()}
      reach={commonReachOf(picked)}
      distance={distance}
      onReach={change}
      commit="blur"
    >
      <Button variant="outline" onClick={() => void local.setLightsLit(picked, !allLit)}>
        {allLit ? 'Apagar' : 'Acender'}
      </Button>
    </LightPanel>
  );
}

type NextLightPanelProps = Readonly<{
  lightReach: StoreApi<LightReachStore>;
  distance: SceneDistance;
}>;

// The reach of the next light: every valid keystroke is remembered.
function NextLightPanel({ lightReach, distance }: NextLightPanelProps): React.JSX.Element {
  const next = useLightReach(lightReach, (state) => state);
  return (
    <LightPanel
      key="next"
      reach={lightReachOf(next)}
      distance={distance}
      onReach={lightReach.getState().setReach}
      commit="change"
    />
  );
}

// Lights with different reaches show empty fields ("vários").
function commonReachOf(lights: readonly LightDto[]): LightReach | null {
  const [first, ...others] = lights;
  if (!first) return null;
  const same = others.every(({ bright, dim }) => bright === first.bright && dim === first.dim);
  return same ? { bright: first.bright, dim: first.dim } : null;
}
