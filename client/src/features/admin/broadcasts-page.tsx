import type { MailBroadcastDto } from '@lorkarium/contracts';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { BroadcastsApi } from '@/services/broadcasts-api';
import { BroadcastEditorPanel } from './broadcast-editor-panel';
import { progressLabel, segmentLabel, stateLabel } from './broadcast-view';

export type BroadcastsPageProps = Readonly<{
  broadcasts: readonly MailBroadcastDto[];
  api: BroadcastsApi;
  /** The admin's own 2FA: without it the send is refused, so the page says why first. */
  twoFactorOn: boolean;
}>;

/** "Comunicados": the service notices by e-mail, the editor on top and the list with the
 *  progress of each one below.
 *
 *  Example: `<BroadcastsPage broadcasts={list} api={deps.broadcastsApi} twoFactorOn />` */
export function BroadcastsPage(props: BroadcastsPageProps): React.JSX.Element {
  const [broadcasts, setBroadcasts] = useState(props.broadcasts);
  const add = (sent: MailBroadcastDto): void =>
    setBroadcasts((list) => [sent, ...list.filter((item) => item.id !== sent.id)]);
  const refresh = async (): Promise<void> => {
    const result = await props.api.list();
    if (result.ok) setBroadcasts(result.value);
  };
  return (
    <div className="flex w-full flex-col gap-8 px-4 py-8 sm:px-8 lg:px-12">
      <title>Lorkarium · Comunicados</title>
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[42px] leading-[1.05] font-medium">Comunicados</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Avisos do serviço por e-mail: mudança de preço ou de condições dos planos, fim do serviço.
          Não há descadastro, então nada de novidades nem propaganda por aqui.
        </p>
      </header>
      <BroadcastEditorPanel api={props.api} twoFactorOn={props.twoFactorOn} onConfirmed={add} />
      <BroadcastList broadcasts={broadcasts} onRefresh={() => void refresh()} />
    </div>
  );
}

type BroadcastListProps = Readonly<{
  broadcasts: readonly MailBroadcastDto[];
  onRefresh: () => void;
}>;

function BroadcastList({ broadcasts, onRefresh }: BroadcastListProps): React.JSX.Element {
  return (
    <section aria-labelledby="broadcast-list" className="flex max-w-2xl flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 id="broadcast-list" className="font-display text-2xl font-medium">
          Enviados
        </h2>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCwIcon aria-hidden="true" />
          Atualizar
        </Button>
      </div>
      {broadcasts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum comunicado ainda.</p>
      ) : (
        <ul aria-label="Comunicados" className="flex flex-col">
          {broadcasts.map((broadcast) => (
            <li key={broadcast.id} className="flex flex-col gap-0.5 border-t border-divider py-3">
              <span className="font-medium text-foreground">{broadcast.subject}</span>
              <span className="text-[13px] text-muted-foreground">
                {segmentLabel(broadcast.segment)} · {stateLabel(broadcast)}
              </span>
              <span className="text-[13px] text-foreground">{progressLabel(broadcast)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
