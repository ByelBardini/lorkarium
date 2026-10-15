import type { SessionMemberDto } from '@lorkarium/contracts';
import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { failureMessage } from '@/features/campaigns/campaign-messages';
import { ROLE_LABEL } from '@/lib/campaign-meta';
import { cn } from '@/lib/utils';
import {
  selectOnlineCount,
  useTablePresence,
  type TablePresenceState,
  type TablePresenceStore,
} from '@/stores/table-presence-store';

export type SessionPresencePanelProps = Readonly<{ store: StoreApi<TablePresenceStore> }>;

const STATUS_LABEL: Readonly<Record<Exclude<TablePresenceState['status'], 'failed'>, string>> = {
  connecting: 'Conectando à mesa…',
  live: 'Ao vivo',
  reconnecting: 'Reconectando…',
};

/** "Na mesa": who is at the table right now, as the server confirmed, and the connection state.
 *
 *  Example: `<SessionPresencePanel store={useTableSession(campaign.id, api, sessionStore)} />` */
export function SessionPresencePanel({ store }: SessionPresencePanelProps): React.JSX.Element {
  const titleId = useId();
  const status = useTablePresence(store, (state) => state.status);
  const failure = useTablePresence(store, (state) => state.failure);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <h2 id={titleId} className="text-[13px] font-semibold text-label">
          Na mesa
        </h2>
        {status !== 'failed' && (
          <p role="status" className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
            {STATUS_LABEL[status]}
          </p>
        )}
      </header>
      {failure && failure !== 'unauthenticated' ? (
        <p role="alert" className="text-sm text-destructive-text">
          {failureMessage(failure)}
        </p>
      ) : (
        <PresenceRoster store={store} />
      )}
    </section>
  );
}

function PresenceRoster({ store }: SessionPresencePanelProps): React.JSX.Element | null {
  const members = useTablePresence(store, (state) => state.members);
  const onlineCount = useTablePresence(store, selectOnlineCount);
  if (members.length === 0) return null;
  return (
    <>
      <p className="text-sm text-muted-foreground">{`${onlineCount} de ${members.length} online`}</p>
      <ul>
        {members.map((member) => (
          <PresenceRow key={member.userId} member={member} />
        ))}
      </ul>
    </>
  );
}

function PresenceRow({ member }: Readonly<{ member: SessionMemberDto }>): React.JSX.Element {
  return (
    <li className="flex items-center gap-3 border-b border-divider py-2 last:border-b-0">
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0', member.online ? 'bg-primary' : 'bg-divider')}
      />
      <span className="flex-1 truncate text-sm">{member.name}</span>
      <span className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
        {ROLE_LABEL[member.role]}
      </span>
      <span
        className={cn(
          'w-12 text-right text-xs',
          member.online ? 'text-label' : 'text-muted-foreground',
        )}
      >
        {member.online ? 'online' : 'offline'}
      </span>
    </li>
  );
}
