import type { LucideIcon } from 'lucide-react';
import type { TokenLayerDto } from '@lorkarium/contracts';
import {
  BoxIcon,
  CircleUserRoundIcon,
  FrameIcon,
  Grid3x3Icon,
  MapIcon,
  MinusIcon,
  MousePointer2Icon,
  PencilIcon,
  PlusIcon,
  RulerIcon,
  Settings2Icon,
  UserPlusIcon,
} from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { BoardRenderer } from '@/renderer/board-renderer';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { LAYER_LABEL } from './board-messages';

export type BoardToolbarProps = Readonly<{
  interaction: StoreApi<BoardInteractionStore>;
  renderer: BoardRenderer | null;
  /** The master: shows "Configurar grid". */
  canConfigure: boolean;
  onConfigure: () => void;
  onNewToken: () => void;
}>;

export const ZOOM_STEP = 1.25;

const PERCENT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });

const LAYER_TOOLS: ReadonlyArray<
  Readonly<{ layer: TokenLayerDto; key: string; icon: LucideIcon }>
> = [
  { layer: 'tokens', key: '1', icon: CircleUserRoundIcon },
  { layer: 'objects', key: '2', icon: BoxIcon },
  { layer: 'background', key: '3', icon: MapIcon },
];

/** The floating tools at the left of the board: select, ruler, draw, local grid, zoom and framing,
 *  plus "Configurar grid" for the master. Every tool also has its key (in the name).
 *
 *  Example: `<BoardToolbar interaction={interaction} renderer={renderer} canConfigure={isMaster} onConfigure={openGridDialog} />` */
export function BoardToolbar({
  interaction,
  renderer,
  canConfigure,
  onConfigure,
  onNewToken,
}: BoardToolbarProps): React.JSX.Element {
  const tool = useBoardInteraction(interaction, (state) => state.tool);
  const grid = useBoardInteraction(interaction, (state) => state.localGridVisible);
  const zoom = useBoardInteraction(interaction, (state) => state.zoom);
  const actions = interaction.getState();
  return (
    <TooltipProvider>
      <div
        role="toolbar"
        aria-label="Ferramentas do tabuleiro"
        aria-orientation="vertical"
        className="absolute top-16 left-3 flex flex-col gap-1 border border-border bg-panel p-1"
      >
        <ToolButton
          label="Selecionar (V)"
          icon={MousePointer2Icon}
          pressed={tool === 'select'}
          onClick={() => actions.setTool('select')}
        />
        <ToolButton
          label="Régua (R)"
          icon={RulerIcon}
          pressed={tool === 'ruler'}
          onClick={() => actions.setTool('ruler')}
        />
        <ToolButton
          label="Desenhar (B)"
          icon={PencilIcon}
          pressed={tool === 'draw'}
          onClick={() => actions.setTool('draw')}
        />
        <ToolButton
          label="Grid (G)"
          icon={Grid3x3Icon}
          pressed={grid}
          onClick={actions.toggleLocalGrid}
        />
        <span aria-hidden="true" className="my-1 h-px bg-divider" />
        <ToolButton
          label="Aproximar (+)"
          icon={PlusIcon}
          disabled={!renderer}
          onClick={() => renderer?.zoomBy(ZOOM_STEP)}
        />
        <span className="py-1 text-center text-[11px] text-muted-foreground tabular-nums">
          {PERCENT.format(zoom)}
        </span>
        <ToolButton
          label="Afastar (−)"
          icon={MinusIcon}
          disabled={!renderer}
          onClick={() => renderer?.zoomBy(1 / ZOOM_STEP)}
        />
        <ToolButton
          label="Enquadrar cena (0)"
          icon={FrameIcon}
          disabled={!renderer}
          onClick={() => renderer?.fitScene()}
        />
        <LayerTools interaction={interaction} />
        {canConfigure && (
          <>
            <span aria-hidden="true" className="my-1 h-px bg-divider" />
            <ToolButton label="Novo token" icon={UserPlusIcon} onClick={onNewToken} />
            <ToolButton label="Configurar grid" icon={Settings2Icon} onClick={onConfigure} />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

// The master's active layer: only what is on it is picked up on the board.
function LayerTools({ interaction }: Pick<BoardToolbarProps, 'interaction'>) {
  const canChoose = useBoardInteraction(interaction, (state) => state.canChooseLayer);
  const active = useBoardInteraction(interaction, (state) => state.activeLayer);
  if (!canChoose) return null;
  return (
    <div role="group" aria-label="Camada" className="flex flex-col gap-1">
      <span aria-hidden="true" className="my-1 h-px bg-divider" />
      {LAYER_TOOLS.map(({ layer, key, icon }) => (
        <ToolButton
          key={layer}
          label={`${LAYER_LABEL[layer]} (${key})`}
          icon={icon}
          pressed={active === layer}
          onClick={() => interaction.getState().setActiveLayer(layer)}
        />
      ))}
    </div>
  );
}

type ToolButtonProps = Readonly<{
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
}>;

function ToolButton({
  label,
  icon: Icon,
  onClick,
  pressed,
  disabled,
}: ToolButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className={pressed ? 'text-primary' : 'text-muted-foreground'}
        >
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
