import type { LucideIcon } from 'lucide-react';
import type { CampaignRoleDto, TokenLayerDto } from '@lorkarium/contracts';
import {
  BoxIcon,
  BrickWallIcon,
  EyeIcon,
  FlameIcon,
  CircleUserRoundIcon,
  FrameIcon,
  Grid3x3Icon,
  MapIcon,
  MinusIcon,
  MousePointer2Icon,
  OrbitIcon,
  PencilIcon,
  PlusIcon,
  RulerIcon,
  Settings2Icon,
  SparklesIcon,
  TagIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { BoardRenderer } from '@/renderer/board-renderer';
import type { AddPlayersResult } from '@/services/table-board-commands';
import { toolsOf } from '@/lib/table-role';
import { useAuraMotion, type AuraMotionStore } from '@/stores/aura-motion-store';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardTool } from '@/stores/board-tool-state';
import { LAYER_LABEL, VIEW_OFF_GRID, addPlayersNotice } from './board-messages';

/** A member "Adicionar jogadores" may name as skipped. */
export type ToolbarMember = Readonly<{ userId: string; name: string }>;

export type BoardToolbarProps = Readonly<{
  interaction: StoreApi<BoardInteractionStore>;
  renderer: BoardRenderer | null;
  /** Which tools show: the spectator's only look (Selecionar, Régua), the master's also put walls,
   *  lights and tokens and configure the scene. */
  role: CampaignRoleDto;
  /** The scene hides what tokens do not see (Escuro, Luz do dia): the master may preview it. */
  sightOn?: boolean;
  /** The table's members: "Adicionar jogadores" names who was skipped. */
  members?: readonly ToolbarMember[];
  /** "Animar auras": local to this browser, for everyone at the table. */
  auraMotion: StoreApi<AuraMotionStore>;
  onConfigure: () => void;
  onNewToken: () => void;
}>;

export const ZOOM_STEP = 1.25;

const PERCENT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });

const PICKED_TOOLS: ReadonlyArray<Readonly<{ tool: BoardTool; label: string; icon: LucideIcon }>> =
  [
    { tool: 'select', label: 'Selecionar (V)', icon: MousePointer2Icon },
    { tool: 'ruler', label: 'Régua (R)', icon: RulerIcon },
    { tool: 'draw', label: 'Desenhar (B)', icon: PencilIcon },
    { tool: 'area', label: 'Área de efeito (M)', icon: SparklesIcon },
    { tool: 'conditions', label: 'Condição (C)', icon: TagIcon },
    { tool: 'walls', label: 'Paredes (P)', icon: BrickWallIcon },
    { tool: 'lights', label: 'Luzes (L)', icon: FlameIcon },
  ];

const LAYER_TOOLS: ReadonlyArray<
  Readonly<{ layer: TokenLayerDto; key: string; icon: LucideIcon }>
> = [
  { layer: 'tokens', key: '1', icon: CircleUserRoundIcon },
  { layer: 'objects', key: '2', icon: BoxIcon },
  { layer: 'background', key: '3', icon: MapIcon },
];

/** The floating tools at the left of the board: select, ruler, draw, area of effect, condition
 *  (not for a spectator), local grid, "Animar auras", zoom and framing, plus walls, lights, tokens and
 *  "Configurar cena" for the master. Every tool also has its key (in the name).
 *
 *  Example: `<BoardToolbar interaction={interaction} renderer={renderer} role={campaign.myRole} onConfigure={openGridDialog} />` */
export function BoardToolbar({
  interaction,
  renderer,
  role,
  sightOn = false,
  members = [],
  auraMotion,
  onConfigure,
  onNewToken,
}: BoardToolbarProps): React.JSX.Element {
  const grid = useBoardInteraction(interaction, (state) => state.localGridVisible);
  const zoom = useBoardInteraction(interaction, (state) => state.zoom);
  const previewing = useBoardInteraction(interaction, (state) => state.sightPreview);
  const actions = interaction.getState();
  const canConfigure = role === 'master';
  return (
    <TooltipProvider>
      {/* Taller than the board, it scrolls inside: overflowing, it let the room scroll and shift
          the canvas under the pointer (the scene e2e on 720 px, once "Animar auras" came in). */}
      <div
        role="toolbar"
        aria-label="Ferramentas do tabuleiro"
        aria-orientation="vertical"
        className="absolute top-16 left-3 flex max-h-[calc(100%-4.75rem)] [scrollbar-width:thin] [scrollbar-color:var(--color-input)_transparent] flex-col gap-1 overflow-y-auto border border-border bg-panel p-1 *:shrink-0"
      >
        <PickedTools interaction={interaction} tools={toolsOf(role)} />
        <ToolButton
          label="Grid (G)"
          icon={Grid3x3Icon}
          pressed={grid}
          onClick={actions.toggleLocalGrid}
        />
        <AuraMotionButton auraMotion={auraMotion} />
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
            <ToolButton
              label="Adicionar jogadores"
              icon={UsersIcon}
              disabled={!renderer}
              onClick={() => renderer && void addPlayersHere(interaction, renderer, members)}
            />
            <ToolButton label="Configurar cena" icon={Settings2Icon} onClick={onConfigure} />
            {sightOn && (
              <ToolButton
                label="Ver como os selecionados"
                icon={EyeIcon}
                pressed={previewing}
                onClick={actions.toggleSightPreview}
              />
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

// Around the middle of the master's view; the status line names who had no token to bring.
async function addPlayersHere(
  interaction: StoreApi<BoardInteractionStore>,
  renderer: BoardRenderer,
  members: readonly ToolbarMember[],
): Promise<void> {
  const center = renderer.viewCenterCell();
  if (!center) return interaction.getState().say(VIEW_OFF_GRID);
  const answer: { result: AddPlayersResult | null } = { result: null };
  await interaction.getState().command(async (commands, scope) => {
    answer.result = await commands.addPlayers(scope, center);
    return answer.result;
  });
  if (!answer.result?.ok) return;
  const { createdIds, skippedMemberIds } = answer.result;
  const skipped = skippedMemberIds.map((id) => members.find(({ userId }) => userId === id)?.name);
  const notice = addPlayersNotice({
    created: createdIds.length,
    skipped: skipped.filter((name): name is string => name !== undefined),
  });
  if (notice) interaction.getState().say(notice);
}

// Local like the grid: a weak PC stills the auras without touching anyone else's board.
function AuraMotionButton({ auraMotion }: Pick<BoardToolbarProps, 'auraMotion'>) {
  const animated = useAuraMotion(auraMotion, (state) => state.animated);
  return (
    <ToolButton
      label="Animar auras"
      icon={OrbitIcon}
      pressed={animated}
      onClick={auraMotion.getState().toggle}
    />
  );
}

type PickedToolsProps = Readonly<{
  interaction: StoreApi<BoardInteractionStore>;
  tools: readonly BoardTool[];
}>;

// The tools the role may pick, in the toolbar's order; the pressed one is the store's.
function PickedTools({ interaction, tools }: PickedToolsProps): React.JSX.Element {
  const tool = useBoardInteraction(interaction, (state) => state.tool);
  const offered = PICKED_TOOLS.filter((candidate) => tools.includes(candidate.tool));
  return (
    <>
      {offered.map(({ tool: candidate, label, icon }) => (
        <ToolButton
          key={candidate}
          label={label}
          icon={icon}
          pressed={tool === candidate}
          onClick={() => interaction.getState().setTool(candidate)}
        />
      ))}
    </>
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
