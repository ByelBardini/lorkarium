import type { CampaignDetailDto } from '@lorkarium/contracts';
import {
  ChevronDownIcon,
  CopyIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldOffIcon,
  TagIcon,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLeaveTable } from '@/features/sessions/use-leave-table';
import { formatCampaignCode } from '@/lib/campaign-code';
import type { Clipboard } from '@/services/clipboard';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import {
  useJuggernautMode,
  type JuggernautMode,
  type JuggernautModeDeps,
} from './use-juggernaut-mode';

export type RoomTableMenuProps = JuggernautModeDeps &
  Readonly<{
    openTables: StoreApi<OpenTablesStore>;
    clipboard: Clipboard;
    /** Controlled by the room top, so the table's name opens the same menu. */
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }>;

type TableMenuEntry = Readonly<{
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  /** Drawn after a separator: the actions that close or change the room. */
  apart?: boolean;
}>;

const ITEM_DANGER = 'text-destructive-text';

/** The chevron after the table's name in the room top, opened by click or right click, and by a click on the
 *  name (the app's
 *  own side menu already carries the brand, so the room top does not repeat it): the master's pages and code, the admin's juggernaut switch and "Sair da mesa".
 *
 *  Example: `<RoomTableMenu campaign={campaign} reader={user} openTables={openTables} interaction={interaction} clipboard={clipboard} open={open} onOpenChange={setOpen} />` */
export function RoomTableMenu(props: RoomTableMenuProps): React.JSX.Element {
  const entries = useTableMenuEntries(props);
  return (
    <ContextMenu modal={false}>
      <DropdownMenu modal={false} open={props.open} onOpenChange={props.onOpenChange}>
        <ContextMenuTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-app-region="no-drag"
              aria-label="Menu da mesa"
              title="Menu da mesa"
              className="group/chevron grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground outline-offset-2 transition-colors group-hover/table-name:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:text-foreground"
            >
              <ChevronDownIcon
                aria-hidden="true"
                className="size-4 transition-transform group-data-[state=open]/chevron:rotate-180 motion-reduce:transition-none"
              />
            </button>
          </DropdownMenuTrigger>
        </ContextMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          {entries.map((entry, index) => (
            <DropdownEntry key={entry.label} entry={entry} first={index === 0} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ContextMenuContent className="w-60">
        {entries.map((entry, index) => (
          <ContextEntry key={entry.label} entry={entry} first={index === 0} />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

type EntryProps = Readonly<{ entry: TableMenuEntry; first: boolean }>;

function DropdownEntry({ entry, first }: EntryProps): React.JSX.Element {
  const Icon = entry.icon;
  return (
    <>
      {entry.apart && !first && <DropdownMenuSeparator />}
      <DropdownMenuItem onSelect={entry.onSelect} className={entry.danger ? ITEM_DANGER : ''}>
        <Icon aria-hidden="true" />
        {entry.label}
      </DropdownMenuItem>
    </>
  );
}

function ContextEntry({ entry, first }: EntryProps): React.JSX.Element {
  const Icon = entry.icon;
  return (
    <>
      {entry.apart && !first && <ContextMenuSeparator />}
      <ContextMenuItem onSelect={entry.onSelect} className={entry.danger ? ITEM_DANGER : ''}>
        <Icon aria-hidden="true" />
        {entry.label}
      </ContextMenuItem>
    </>
  );
}

function useTableMenuEntries(props: RoomTableMenuProps): TableMenuEntry[] {
  const navigate = useNavigate();
  const leaveTable = useLeaveTable(props.openTables);
  const juggernaut = useJuggernautMode(props);
  const { campaign } = props;
  const leave: TableMenuEntry = {
    label: 'Sair da mesa',
    icon: LogOutIcon,
    onSelect: () => void leaveTable(campaign.id),
    apart: true,
  };
  const master =
    campaign.myRole === 'master' ? masterEntries(campaign, props.clipboard, navigate) : [];
  return [...master, ...juggernautEntries(juggernaut), leave];
}

function juggernautEntries(mode: JuggernautMode | null): TableMenuEntry[] {
  if (!mode) return [];
  const entry: TableMenuEntry = {
    label: mode.on ? 'Sair do modo juggernaut' : 'Ativar modo juggernaut',
    icon: mode.on ? ShieldOffIcon : ShieldAlertIcon,
    // A second click while the request is on its way would send it twice.
    onSelect: mode.pending ? () => undefined : mode.toggle,
    danger: true,
    apart: true,
  };
  return [entry];
}

function masterEntries(
  campaign: CampaignDetailDto,
  clipboard: Clipboard,
  navigate: (to: string) => void | Promise<void>,
): TableMenuEntry[] {
  const table = `/campaigns/${encodeURIComponent(campaign.id)}/table`;
  const entries: TableMenuEntry[] = [
    {
      label: 'Configurações da mesa',
      icon: SettingsIcon,
      onSelect: () => void navigate(`${table}/settings`),
    },
    {
      label: 'Condições da mesa',
      icon: TagIcon,
      onSelect: () => void navigate(`${table}/conditions`),
    },
  ];
  const code = campaign.joinCode;
  if (!code) return entries;
  const copy = (): void => void clipboard.copy(formatCampaignCode(code));
  return [...entries, { label: 'Copiar código', icon: CopyIcon, onSelect: copy }];
}
