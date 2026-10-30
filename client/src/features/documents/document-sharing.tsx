import type { CampaignDetailDto, DocumentDto } from '@lorkarium/contracts';
import { LockKeyholeIcon, Trash2Icon, UsersRoundIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useState } from 'react';
import type { LibrarySubmit } from '@/features/library/use-library-submit';

type DocumentSharingProps = Readonly<{
  document: DocumentDto;
  campaign: CampaignDetailDto;
  submit: LibrarySubmit;
  disabled: boolean;
  onDelete?: () => void;
}>;

/** Master-only access controls stay in a deliberate sharing popover. Example: <DocumentSharing document={document} campaign={campaign} submit={submit} disabled={false} />. */
export function DocumentSharing({
  document,
  campaign,
  submit,
  disabled,
  onDelete,
}: DocumentSharingProps): React.JSX.Element | null {
  const [owners, setOwners] = useState(document.ownerIds ?? []);
  if (!document.canManage) return null;
  const players = campaign.members.filter((member) => member.role === 'player');
  const publish = (visibility: 'public' | 'private'): void => {
    void submit({
      intent: 'updateDocument',
      documentId: document.id,
      changes: { actionId: crypto.randomUUID(), expectedVersion: document.version, visibility },
    });
  };
  const saveOwners = (): void => {
    void submit({
      intent: 'updateDocument',
      documentId: document.id,
      changes: {
        actionId: crypto.randomUUID(),
        expectedVersion: document.version,
        ownerIds: owners,
      },
    });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Compartilhamento" className="gap-2">
          <UsersRoundIcon aria-hidden="true" className="size-3.5" />
          Compartilhamento
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="flex items-start gap-3 border-b border-divider p-4">
          <LockKeyholeIcon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
          <div>
            <h2 className="text-sm font-medium">Acesso ao documento</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Compartilhe a leitura com a mesa e escolha quem pode editar.
            </p>
          </div>
        </div>
        <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-4 p-4">
          <legend className="sr-only">Compartilhamento do documento</legend>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Visível para todos na mesa
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Participantes podem ler este documento.
              </span>
            </span>
            <input
              aria-label="Visível para todos na mesa"
              type="checkbox"
              className="size-4 shrink-0 accent-primary"
              checked={document.visibility === 'public'}
              onChange={(event) => publish(event.target.checked ? 'public' : 'private')}
            />
          </label>
          <div className="border-t border-divider pt-4">
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
              QUEM PODE EDITAR
            </p>
            <div className="flex max-h-52 flex-col gap-1 overflow-auto">
              {players.map((member) => (
                <label
                  key={member.userId}
                  className="flex items-center justify-between gap-3 rounded-sm px-1 py-2 text-sm hover:bg-muted"
                >
                  <span>{member.name}</span>
                  <input
                    aria-label={member.name}
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={owners.includes(member.userId)}
                    onChange={(event) =>
                      setOwners((current) =>
                        event.target.checked
                          ? [...current, member.userId]
                          : current.filter((id) => id !== member.userId),
                      )
                    }
                  />
                </label>
              ))}
              {!players.length && (
                <p className="py-1 text-xs text-muted-foreground">
                  A mesa ainda não tem jogadores.
                </p>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Os donos também acessam o documento oculto.
            </p>
          </div>
          <Button variant="outline" size="sm" className="self-end" onClick={saveOwners}>
            Salvar donos
          </Button>
        </fieldset>
        {onDelete && (
          <div className="border-t border-divider p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-destructive-text hover:text-destructive-text"
              disabled={disabled}
              onClick={onDelete}
            >
              <Trash2Icon aria-hidden="true" />
              Excluir documento
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
