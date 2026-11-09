import type { CampaignDetailDto } from '@lorkarium/contracts';
import { MapIcon } from 'lucide-react';
import { useContext } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { cn } from '@/lib/utils';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import { MainMapReaderContext, useMapHome, type MapHomeDeps } from './use-map-home';

const NAME_STYLE = 'min-w-0 font-display text-xl font-semibold';
const HOME_LABEL = 'Abrir o mapa principal';

export type RoomNameProps = Readonly<{
  campaign: CampaignDetailDto;
  /** `null` until the table opens. */
  tabs: StoreApi<SceneTabsStore> | null;
  workspace: StoreApi<DocumentWorkspaceStore> | undefined;
}>;

/** The name of the table in the room's top bar. With a main map, an icon button beside it plays the
 *  map's tab, which the strip does not draw: it goes back to the map and lights up while it is on
 *  screen.
 *
 *  Example: `<RoomName campaign={campaign} tabs={tabs} workspace={documentWorkspace} />` */
export function RoomName({ campaign, tabs, workspace }: RoomNameProps): React.JSX.Element {
  const reader = useContext(MainMapReaderContext);
  if (!tabs || !workspace || !reader) return <PlainRoomName name={campaign.name} />;
  return <RoomNameWithHome campaign={campaign} tabs={tabs} workspace={workspace} reader={reader} />;
}

function PlainRoomName({ name }: Readonly<{ name: string }>): React.JSX.Element {
  return <h1 className={`${NAME_STYLE} truncate`}>{name}</h1>;
}

function RoomNameWithHome(deps: MapHomeDeps): React.JSX.Element {
  const { hasHome, homeShown, openHome } = useMapHome(deps);
  if (!hasHome) return <PlainRoomName name={deps.campaign.name} />;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        data-app-region="no-drag"
        aria-label={HOME_LABEL}
        title={HOME_LABEL}
        aria-current={homeShown ? 'page' : undefined}
        onClick={openHome}
        className={cn(
          'grid size-7 shrink-0 cursor-pointer place-items-center rounded-sm border outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
          homeShown
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border text-label hover:border-primary hover:text-primary',
        )}
      >
        <MapIcon aria-hidden="true" className="size-4" />
      </button>
      <PlainRoomName name={deps.campaign.name} />
    </div>
  );
}
