import type { CampaignDetailDto } from '@lorkarium/contracts';
import { MapIcon, ScrollTextIcon, type LucideIcon } from 'lucide-react';
import { useContext, type ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useHomeShortcut } from '@/features/board/use-home-shortcut';
import type { ViewerMainSheet } from '@/features/sheets/use-viewer-main-sheet';
import { cn } from '@/lib/utils';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import { MainMapReaderContext, useMapHome, type MapHomeDeps } from './use-map-home';

const NAME_STYLE = 'min-w-0 font-display text-xl font-semibold';
const HOME_LABEL = 'Abrir o mapa principal';
const MAP_KEYS = 'Shift+M';
const SHEET_KEYS = 'Shift+F';

export type RoomNameProps = Readonly<{
  campaign: CampaignDetailDto;
  /** `null` until the table opens. */
  tabs: StoreApi<SceneTabsStore> | null;
  workspace: StoreApi<DocumentWorkspaceStore> | undefined;
  /** The viewer's main sheet; `null` (or left out) draws no sheet button. */
  mainSheet?: ViewerMainSheet | null;
  /** The table menu: its chevron sits in one hover pill with the name, and clicking the name
   *  opens it too. Left out, the name is plain text. */
  menu?: Readonly<{ chevron: ReactNode; open: () => void }>;
}>;

/** The name of the table in the room's top bar; a click on it opens the table menu. With a main map, an icon button beside it plays the
 *  map's tab, which the strip does not draw: it goes back to the map (also Shift+M) and lights up
 *  while it is on screen. The viewer's main sheet gets its twin right after (Shift+F).
 *
 *  Example: `<RoomName campaign={campaign} tabs={tabs} workspace={documentWorkspace} mainSheet={mainSheet} />` */
export function RoomName(props: RoomNameProps): React.JSX.Element {
  const { campaign, tabs, workspace, mainSheet = null, menu } = props;
  const reader = useContext(MainMapReaderContext);
  const room = tabs && workspace ? { campaignId: campaign.id, tabs, workspace } : null;
  const sheetBack = mainSheet && room ? { shown: mainSheet.shown, room } : null;
  useHomeShortcut('main-sheet', mainSheet?.open ?? null, sheetBack);
  const sheetButton = mainSheet && <MainSheetButton sheet={mainSheet} />;
  const name = <TableName name={campaign.name} menu={menu} />;
  if (!tabs || !workspace || !reader) return <NameRow name={name} sheetButton={sheetButton} />;
  const deps = { campaign, tabs, workspace, reader };
  return <RoomNameWithHome deps={deps} name={name} sheetButton={sheetButton} />;
}

type TableNameProps = Readonly<{ name: string; menu: RoomNameProps['menu'] }>;

// The button lives inside the heading, so the heading keeps the table's name as its own. Name and
// chevron light up as one pill, also while the menu is open.
function TableName({ name, menu }: TableNameProps): React.JSX.Element {
  if (!menu) return <h1 className={`${NAME_STYLE} truncate`}>{name}</h1>;
  return (
    <div
      data-app-region="no-drag"
      className="group/table-name flex h-8 min-w-0 items-center rounded-md pr-0.5 transition-colors hover:bg-card has-data-[state=open]:bg-card"
    >
      <h1 className={`${NAME_STYLE} min-w-0`}>
        <button
          type="button"
          aria-haspopup="menu"
          onClick={menu.open}
          className="block max-w-full cursor-pointer truncate rounded-md py-0.5 pr-1 pl-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {name}
        </button>
      </h1>
      {menu.chevron}
    </div>
  );
}

type NameRowProps = Readonly<{ name: ReactNode; mapButton?: ReactNode; sheetButton: ReactNode }>;

function NameRow({ name, mapButton, sheetButton }: NameRowProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {mapButton}
      {sheetButton}
      {name}
    </div>
  );
}

type WithHomeProps = Readonly<{ deps: MapHomeDeps; name: ReactNode; sheetButton: ReactNode }>;

function RoomNameWithHome({ deps, name, sheetButton }: WithHomeProps): React.JSX.Element {
  const { hasHome, homeShown, openHome } = useMapHome(deps);
  const { campaign, tabs, workspace } = deps;
  const back = { shown: homeShown, room: { campaignId: campaign.id, tabs, workspace } };
  useHomeShortcut('main-map', hasHome ? openHome : null, back);
  const mapButton = hasHome && (
    <HomeButton
      icon={MapIcon}
      label={HOME_LABEL}
      keys={MAP_KEYS}
      shown={homeShown}
      onClick={openHome}
    />
  );
  return <NameRow name={name} mapButton={mapButton} sheetButton={sheetButton} />;
}

function MainSheetButton({ sheet }: Readonly<{ sheet: ViewerMainSheet }>): React.JSX.Element {
  return (
    <HomeButton
      icon={ScrollTextIcon}
      label={`Abrir a ficha de ${sheet.characterName}`}
      keys={SHEET_KEYS}
      shown={sheet.shown}
      onClick={sheet.open}
    />
  );
}

type HomeButtonProps = Readonly<{
  icon: LucideIcon;
  label: string;
  /** Said in the tooltip and to assistive tech (`aria-keyshortcuts`). */
  keys: string;
  shown: boolean;
  onClick: () => void;
}>;

function HomeButton({ icon: Icon, label, keys, shown, onClick }: HomeButtonProps) {
  return (
    <button
      type="button"
      data-app-region="no-drag"
      aria-label={label}
      aria-keyshortcuts={keys}
      title={`${label} (${keys})`}
      aria-current={shown ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'grid size-7 shrink-0 cursor-pointer place-items-center rounded-sm border outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
        shown
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-label hover:border-primary hover:text-primary',
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}
