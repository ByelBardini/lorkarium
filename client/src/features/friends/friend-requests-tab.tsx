import type { FriendRequestEntryDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { friendsFailureText } from '@/lib/friends-failure-text';
import { sinceLabel } from '@/lib/since-label';
import type { FriendsResult } from '@/services/friends-api';
import { FriendConfirmDialog } from './friend-confirm-dialog';
import { blockConfirmation, type FriendConfirmation } from './friend-confirmations';
import { FriendPerson } from './friend-person';
import { FriendsSection } from './friends-section';
import type { FriendsScreenDeps, ShowFriendsNotice } from './friends-screen';

export type FriendRequestsTabProps = Readonly<{
  incoming: readonly FriendRequestEntryDto[];
  outgoing: readonly FriendRequestEntryDto[];
  deps: FriendsScreenDeps;
  onNotice: ShowFriendsNotice;
}>;

type RunCommand = (result: Promise<FriendsResult<unknown>>, done: string) => Promise<void>;

/** "Pedidos": received ones (Aceitar, Recusar, "Recusar e bloquear") and sent ones (Cancelar).
 *
 *  Example: `<FriendRequestsTab incoming={overview.incoming} outgoing={overview.outgoing} deps={deps} onNotice={show} />` */
export function FriendRequestsTab(props: FriendRequestsTabProps): React.JSX.Element {
  const { deps, onNotice } = props;
  const [confirmation, setConfirmation] = useState<FriendConfirmation | null>(null);
  const run: RunCommand = async (pending, done) => {
    const result = await pending;
    onNotice(
      result.ok
        ? { text: done, error: false }
        : { text: friendsFailureText(result.failure), error: true },
    );
  };
  const now = deps.now();
  return (
    <div className="flex flex-col gap-6 py-4">
      <FriendsSection title="Recebidos" count={props.incoming.length} empty="Nenhum pedido novo.">
        {props.incoming.map((request) => (
          <IncomingRow
            key={request.userId}
            request={request}
            detail={sinceLabel(request.at, now)}
            deps={deps}
            run={run}
            confirm={setConfirmation}
          />
        ))}
      </FriendsSection>
      <FriendsSection
        title="Enviados"
        count={props.outgoing.length}
        empty="Você não mandou nenhum pedido."
      >
        {props.outgoing.map((request) => (
          <RequestLine key={request.userId} request={request} detail={sinceLabel(request.at, now)}>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void run(deps.friends.getState().dropRequest(request.userId), 'Pedido cancelado.')
              }
            >
              Cancelar
            </Button>
          </RequestLine>
        ))}
      </FriendsSection>
      <FriendConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
    </div>
  );
}

type IncomingRowProps = Readonly<{
  request: FriendRequestEntryDto;
  detail: string;
  deps: FriendsScreenDeps;
  run: RunCommand;
  confirm: (confirmation: FriendConfirmation) => void;
}>;

function IncomingRow({ request, detail, deps, run, confirm }: IncomingRowProps): React.JSX.Element {
  const friends = deps.friends.getState();
  const { userId, name } = request;
  const block = (): void =>
    void run(friends.block({ userId }), `Pedido de ${name} recusado e ${name} bloqueado.`);
  return (
    <RequestLine request={request} detail={detail}>
      <Button
        size="sm"
        onClick={() => void run(friends.acceptRequest(userId), `Agora você e ${name} são amigos.`)}
      >
        Aceitar
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void run(friends.dropRequest(userId), `Pedido de ${name} recusado.`)}
      >
        Recusar
      </Button>
      <Button variant="ghost" size="sm" onClick={() => confirm(blockConfirmation(name, block))}>
        Recusar e bloquear
      </Button>
    </RequestLine>
  );
}

function RequestLine({
  request,
  detail,
  children,
}: Readonly<{
  request: FriendRequestEntryDto;
  detail: string;
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <li
      aria-label={request.name}
      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
    >
      <FriendPerson person={request} detail={`@${request.username} · ${detail}`} />
      <span className="flex gap-1">{children}</span>
    </li>
  );
}
