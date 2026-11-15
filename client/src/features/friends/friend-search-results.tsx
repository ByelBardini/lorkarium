import type { FriendProfileDto } from '@lorkarium/contracts';
import { CheckIcon, UserPlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { friendsFailureText } from '@/lib/friends-failure-text';
import type { StoreApi } from 'zustand/vanilla';
import type { FriendsStore } from '@/stores/friends-store';
import { FriendPerson } from './friend-person';
import type { FriendSearchState } from './use-friend-search';

/** Where each found account stands: sent or accepted keeps the row, with the button done. */
type SentState = Readonly<
  { kind: 'sending' } | { kind: 'sent'; text: string } | { kind: 'refused'; text: string }
>;

export type FriendSearchResultsProps = Readonly<{
  state: FriendSearchState;
  friends: StoreApi<FriendsStore>;
}>;

/** The list under the search of "Adicionar amigo": one row per account found, each with its own
 *  "Enviar pedido", so the person sends to as many as they want.
 *
 *  Example: `<FriendSearchResults state={useFriendSearch(deps.friends, typed)} friends={deps.friends} />` */
export function FriendSearchResults({
  state,
  friends,
}: FriendSearchResultsProps): React.JSX.Element {
  const [sent, setSent] = useState<Readonly<Record<string, SentState>>>({});
  const send = async (account: FriendProfileDto): Promise<void> => {
    setSent((before) => ({ ...before, [account.userId]: { kind: 'sending' } }));
    const result = await friends.getState().sendRequest(account.username);
    setSent((before) => ({ ...before, [account.userId]: sentStateOf(result, account.username) }));
  };
  if (state.kind !== 'found') return <SearchStateLine state={state} />;
  if (state.accounts.length === 0) return <SearchLine text="Ninguém com esse @ para adicionar." />;
  return (
    <ul aria-label="Pessoas encontradas" className="flex max-h-80 flex-col gap-1 overflow-y-auto">
      {state.accounts.map((account) => (
        <FoundAccountRow
          key={account.userId}
          account={account}
          sent={sent[account.userId]}
          onSend={() => void send(account)}
        />
      ))}
    </ul>
  );
}

function sentStateOf(
  result: Awaited<ReturnType<FriendsStore['sendRequest']>>,
  username: string,
): SentState {
  if (!result.ok) return { kind: 'refused', text: friendsFailureText(result.failure, username) };
  const text = result.value === 'accepted' ? 'Agora vocês são amigos.' : 'Pedido enviado.';
  return { kind: 'sent', text };
}

type FoundAccountRowProps = Readonly<{
  account: FriendProfileDto;
  sent: SentState | undefined;
  onSend: () => void;
}>;

function FoundAccountRow({ account, sent, onSend }: FoundAccountRowProps): React.JSX.Element {
  const done = sent?.kind === 'sent';
  return (
    <li className="flex flex-col gap-1 rounded-md px-2 py-2 hover:bg-muted/40">
      <div className="flex items-center justify-between gap-2">
        <FriendPerson person={account} detail={`@${account.username}`} />
        <Button
          size="sm"
          variant={done ? 'outline' : 'default'}
          disabled={done || sent?.kind === 'sending'}
          aria-label={
            done
              ? `Pedido enviado pra @${account.username}`
              : `Enviar pedido pra @${account.username}`
          }
          onClick={onSend}
        >
          {done ? <CheckIcon aria-hidden="true" /> : <UserPlusIcon aria-hidden="true" />}
          {done ? 'Enviado' : 'Enviar pedido'}
        </Button>
      </div>
      <SentLine sent={sent} />
    </li>
  );
}

function SentLine({ sent }: Readonly<{ sent: SentState | undefined }>): React.JSX.Element | null {
  if (sent?.kind === 'refused') {
    return (
      <p role="alert" className="text-xs text-destructive-text">
        {sent.text}
      </p>
    );
  }
  if (sent?.kind !== 'sent') return null;
  return (
    <p role="status" className="text-xs text-muted-foreground">
      {sent.text}
    </p>
  );
}

function SearchStateLine({ state }: Readonly<{ state: FriendSearchState }>): React.JSX.Element {
  if (state.kind === 'searching') return <SearchLine text="Buscando…" />;
  if (state.kind === 'failed')
    return <SearchLine text="Não deu pra buscar agora. Tente de novo." alert />;
  return <SearchLine text="Digite pelo menos 2 letras do @." />;
}

function SearchLine({
  text,
  alert = false,
}: Readonly<{ text: string; alert?: boolean }>): React.JSX.Element {
  return (
    <p
      role={alert ? 'alert' : 'status'}
      className={alert ? 'text-sm text-destructive-text' : 'text-sm text-muted-foreground'}
    >
      {text}
    </p>
  );
}
