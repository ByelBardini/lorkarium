import type { CampaignRoleDto, DiceRolledDto, SavedRollDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { savedRollPartsOf } from '@/lib/dice-tray';
import { canAddTrayParts } from '@/lib/dice-tray-pieces';
import type { InteractionClock } from '@/lib/interaction-clock';
import { watchesOnly } from '@/lib/table-role';
import type { DiceCommands } from '@/services/dice-commands';
import type { SavedRollsApi } from '@/services/saved-rolls-api';
import { diceTrayStoreOf, useDiceTray } from '@/stores/dice-tray-store';
import { useOpenTables, type OpenTablesStore } from '@/stores/open-tables-store';
import { useSession, type SessionStore } from '@/stores/session-store';
import type { TablePresenceStore } from '@/stores/table-presence-store';
import { DiceHistory } from './dice-history';
import { DiceTrayEditor } from './dice-tray';
import { SavedRollsList } from './saved-rolls-list';
import { useDiceRoller, type DiceRollAsk, type DiceRoller } from './use-dice-roller';
import { useSavedRolls } from './use-saved-rolls';

/** The app's dice services the tab needs (the `AppDependencies` of the same names). */
export type DiceServices = Readonly<{
  dice: DiceCommands;
  savedRolls: SavedRollsApi;
  /** The wall clock of the history's `revealAtMs`. */
  diceClock: InteractionClock;
}>;

export type DicePanelProps = Readonly<{
  campaignId: string;
  role: CampaignRoleDto;
  /** The signed-in account: "Rolar de novo" only on one's own rolls. */
  sessionStore: StoreApi<SessionStore>;
  openTables: StoreApi<OpenTablesStore>;
  presence: StoreApi<TablePresenceStore> | null;
  services: DiceServices;
}>;

/** The "Dados" tab of the room: (for who plays) the tray and the saved rolls, and the history
 *  at the bottom. A spectator sees only the history. "Dados 3D" and the dice's look live in
 *  "Minha conta", not here.
 *
 *  Example: `<DicePanel campaignId={campaign.id} role={campaign.myRole} sessionStore={deps.sessionStore} openTables={openTables} presence={presence} services={diceServices} />` */
export function DicePanel(props: DicePanelProps): React.JSX.Element {
  const { campaignId, services } = props;
  const history = useOpenTables(
    props.openTables,
    (state) => state.tables.find((table) => table.campaignId === campaignId)?.dice ?? null,
  );
  const session = useSession(props.sessionStore);
  const roller = useDiceRoller(campaignId, services.dice);
  const spectator = watchesOnly(props.role);
  return (
    <div className="flex flex-col gap-6">
      {!spectator && (
        <RollingSections
          campaignId={campaignId}
          openTables={props.openTables}
          services={services}
          roller={roller}
        />
      )}
      {history !== null && (
        <DiceHistory
          history={history}
          presence={props.presence}
          clock={services.diceClock}
          viewerId={session.status === 'authenticated' ? session.user.id : null}
          onReroll={spectator ? null : (event) => void roller.roll(rerollOf(event))}
        />
      )}
    </div>
  );
}

type RollingProps = Readonly<{
  campaignId: string;
  openTables: StoreApi<OpenTablesStore>;
  services: DiceServices;
  roller: DiceRoller;
}>;

// The tray lives in a store per table, not here: the sheet adds to it too, and it outlives
// switching to the Chat tab (the tab's badge counts it).
function RollingSections(props: RollingProps): React.JSX.Element {
  const { campaignId, services, roller } = props;
  const saved = useSavedRolls(campaignId, services.savedRolls);
  const tray = diceTrayStoreOf(props.openTables, campaignId);
  const choice = useDiceTray(tray, (state) => state.choice);
  const setChoice = tray.getState().setChoice;
  const rollSaved = (roll: SavedRollDto) => {
    const visibility = choice.secret ? 'masters' : 'public';
    void roller.roll({ label: roll.name, parts: savedRollPartsOf(roll), visibility });
  };
  return (
    <>
      <DiceTrayEditor choice={choice} onChoice={setChoice} roller={roller} saved={saved} />
      <SavedRollsList
        saved={saved}
        rollDisabled={roller.busy}
        onRoll={rollSaved}
        onAddToTray={(roll) => void tray.getState().addSavedRoll(roll)}
        fitsInTray={(roll) => canAddTrayParts(choice.tray, roll.parts.length)}
      />
    </>
  );
}

function rerollOf(event: DiceRolledDto): DiceRollAsk {
  return {
    label: event.label,
    parts: event.parts.map(({ label, expression }) => ({ label, expression })),
    visibility: event.visibility,
  };
}
