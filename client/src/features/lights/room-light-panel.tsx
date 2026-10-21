import type { LightDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import type { LightColor } from '@/lib/light-color';
import type { SceneDistance } from '@/lib/range-form';
import type { LightReach } from '@/services/light-commands';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useLightColor, type LightColorStore } from '@/stores/light-color-store';
import { lightReachOf, useLightReach, type LightReachStore } from '@/stores/light-reach-store';
import { LightPanel } from './light-panel';

export type RoomLightPanelProps = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  lightReach: StoreApi<LightReachStore>;
  lightColor: StoreApi<LightColorStore>;
}>;

const NO_LIGHTS: readonly LightDto[] = [];

/** The lights panel of the room: with lights picked, their reach and opening (one command per
 *  field left, on the undo stack) and color (one command per tile); with none, the reach, color and
 *  opening of the next light, remembered in the browser.
 *  Typed in the unit of the scene.
 *
 *  Example: `<RoomLightPanel board={table.board} interaction={interaction} lightReach={deps.lightReach} lightColor={deps.lightColor} />` */
export function RoomLightPanel(props: RoomLightPanelProps): React.JSX.Element | null {
  const { board, interaction, lightReach, lightColor } = props;
  const scene = useBoard(board, (state) => state.board?.scene ?? null);
  const lights = useBoard(board, (state) => state.board?.lights ?? NO_LIGHTS);
  const selectedIds = useBoardInteraction(interaction, (state) => state.selectedLightIds);
  if (!scene) return null;
  const distance = { cellDistance: scene.cellDistance, cellUnit: scene.cellUnit };
  const picked = lights.filter(({ id }) => selectedIds.includes(id));
  if (picked.length === 0) {
    return <NextLightPanel lightReach={lightReach} lightColor={lightColor} distance={distance} />;
  }
  const local = interaction.getState();
  const change = (reach: LightReach): void => void local.changeLightRanges(picked, reach);
  const recolor = (color: LightColor): void => void local.changeLightColors(picked, color);
  const open = (angle: number): void => void local.changeLightAngles(picked, angle);
  // All lit: put them out; any out: light them all.
  const allLit = picked.every(({ lit }) => lit);
  return (
    <LightPanel
      key={selectedIds.join()}
      reach={commonOf(picked, ({ bright, dim }) => ({ bright, dim })) ?? null}
      distance={distance}
      onReach={change}
      color={commonOf(picked, ({ color }) => color)}
      onColor={recolor}
      angle={commonOf(picked, ({ angle }) => angle) ?? null}
      onAngle={open}
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
  lightColor: StoreApi<LightColorStore>;
  distance: SceneDistance;
}>;

// The reach and color of the next light: every valid keystroke and every tile is remembered.
function NextLightPanel(props: NextLightPanelProps): React.JSX.Element {
  const { lightReach, lightColor, distance } = props;
  const next = useLightReach(lightReach, (state) => state);
  const color = useLightColor(lightColor, (state) => state.color);
  return (
    <LightPanel
      key="next"
      reach={lightReachOf(next)}
      distance={distance}
      onReach={lightReach.getState().setReach}
      color={color}
      onColor={lightColor.getState().setColor}
      angle={next.angle}
      onAngle={lightReach.getState().setAngle}
      commit="change"
    />
  );
}

// What every light picked shares; `undefined` when they differ (the panel says "vários").
function commonOf<T>(lights: readonly LightDto[], valueOf: (light: LightDto) => T): T | undefined {
  const [first, ...others] = lights;
  if (!first) return undefined;
  const shared = valueOf(first);
  const key = JSON.stringify(shared);
  return others.every((light) => JSON.stringify(valueOf(light)) === key) ? shared : undefined;
}
