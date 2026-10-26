import type { DiceRolledDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { UserAvatar } from '@/components/user-avatar';
import { naturalOf } from '@/lib/dice-breakdown';
import { DICE_NOTICE_MS, isNoticeLive, latestRevealedOf } from '@/lib/dice-reveal';
import type { InteractionClock } from '@/lib/interaction-clock';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { useDiceHistory, type DiceHistoryStore } from '@/stores/dice-history-store';
import { useOpenTables, type OpenTablesStore } from '@/stores/open-tables-store';
import { useRoomLayout, type RoomLayoutStore } from '@/stores/room-layout-store';
import type { TablePresenceStore } from '@/stores/table-presence-store';
import { revealAnnouncement } from './dice-messages';
import { NATURAL_TOTAL_CLASS } from './natural-tone';
import { useRevealClock } from './use-reveal-clock';
import { useRollerIdentity, type RollerIdentity } from './use-roller-identity';

export type DiceRollNoticeProps = Readonly<{
  campaignId: string;
  openTables: StoreApi<OpenTablesStore>;
  presence: StoreApi<TablePresenceStore> | null;
  /** Where the board is free: left of the open panel, above "Painel" on a phone. */
  roomLayout: StoreApi<RoomLayoutStore>;
  /** The wall clock the history's `revealAtMs` is on. */
  clock: InteractionClock;
}>;

/** The total of every roll one sees, over the board for `DICE_NOTICE_MS` once the dice stop:
 *  who rolled, the label, the formula and the total (gold on a natural 20). It is also the only
 *  announcement of the roll to the screen reader (a polite region, always mounted). Never a
 *  masters-only notice, nor a roll already revealed when the room opened.
 *
 *  Example: `<DiceRollNotice campaignId={campaign.id} openTables={openTables} presence={table?.presence ?? null} roomLayout={roomLayout} clock={deps.diceClock} />` */
export function DiceRollNotice(props: DiceRollNoticeProps): React.JSX.Element {
  const history = useOpenTables(
    props.openTables,
    (state) => state.tables.find((table) => table.campaignId === props.campaignId)?.dice ?? null,
  );
  if (history === null) return <p aria-live="polite" className="sr-only" />;
  return <RevealedNotice {...props} history={history} />;
}

type RevealedNoticeProps = DiceRollNoticeProps & Readonly<{ history: StoreApi<DiceHistoryStore> }>;

function RevealedNotice(props: RevealedNoticeProps): React.JSX.Element {
  const entries = useDiceHistory(props.history, (state) => state.entries);
  const rollerOf = useRollerIdentity(props.presence);
  const { now, shownAt } = useRevealClock(entries, props.clock, DICE_NOTICE_MS);
  const last = latestRevealedOf(entries, now, shownAt);
  const roller = last === null ? null : rollerOf(last.event.rollerId);
  return (
    <>
      <p aria-live="polite" className="sr-only">
        {last !== null && roller !== null
          ? revealAnnouncement(roller.name, last.event.total, last.event.label)
          : ''}
      </p>
      {last !== null && roller !== null && isNoticeLive(last, now) && (
        <NoticePlace roomLayout={props.roomLayout}>
          <NoticeCard event={last.event} roller={roller} />
        </NoticePlace>
      )}
    </>
  );
}

type NoticePlaceProps = Readonly<{
  roomLayout: StoreApi<RoomLayoutStore>;
  children: React.ReactNode;
}>;

// Centred on the free board: the panel covers the right 360px when open (not in focus mode), and
// on a phone "Painel" sits at the bottom right.
function NoticePlace({ roomLayout, children }: NoticePlaceProps): React.JSX.Element {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const panelShown = useRoomLayout(roomLayout, (state) => state.panel === 'open' && !state.focus);
  return (
    <div
      className={cn(
        'pointer-events-none absolute left-0 flex justify-center px-4',
        desktop ? 'bottom-6' : 'bottom-16',
        desktop && panelShown ? 'right-90' : 'right-0',
      )}
    >
      {children}
    </div>
  );
}

type NoticeCardProps = Readonly<{ event: DiceRolledDto; roller: RollerIdentity }>;

function NoticeCard({ event, roller }: NoticeCardProps): React.JSX.Element {
  const natural = naturalOf(event);
  const who =
    event.label === null ? `${roller.name} rolou` : `${roller.name} rolou · ${event.label}`;
  return (
    <div
      aria-hidden="true"
      data-testid="dice-roll-notice"
      className={cn(
        'flex max-w-full items-center gap-4 rounded-md border bg-card py-3 pr-6 pl-3.5',
        natural === 'twenty' ? 'border-primary' : 'border-border',
      )}
    >
      <UserAvatar name={roller.name} color={roller.color} avatarId={roller.avatarId} size="md" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm text-muted-foreground">{who}</span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {event.parts.map((part) => part.expression).join(' + ')}
        </span>
      </div>
      <span
        className={cn(
          'font-display text-5xl leading-none font-semibold tabular-nums',
          natural === null ? 'text-foreground' : NATURAL_TOTAL_CLASS[natural],
        )}
      >
        {event.total}
      </span>
    </div>
  );
}
