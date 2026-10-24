import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { Clipboard } from '@/services/clipboard';
import { InviteForm } from './invite-form';
import { ShareLinkPanel } from './share-link-panel';
import { usersFailureOf, useUsersFetcher } from './use-users-fetcher';

export type InviteSheetProps = Readonly<{
  ownerOf: (email: string) => string | null;
  clipboard: Clipboard;
  /** "Reenviar convite" after `already_invited`: the page opens the resend dialog. */
  onResend: (invitationId: string) => void;
  onClose: () => void;
}>;

/** "Convidar pessoa": the form, then "Convite enviado" with the link to copy (shown once). The
 *  router reloads the list after the invitation, so it is already the first row on closing.
 *
 *  Example: `<InviteSheet ownerOf={ownerOf} clipboard={clipboard} onResend={…} onClose={…} />` */
export function InviteSheet({
  ownerOf,
  clipboard,
  onResend,
  onClose,
}: InviteSheetProps): React.JSX.Element {
  const fetcher = useUsersFetcher();
  const settled = fetcher.settled;
  const link = settled && settled.intent === 'invite' && 'link' in settled ? settled.link : null;
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-6 p-6 sm:max-w-md">
        <SheetHeader className="p-0">
          <SheetTitle className="font-display text-2xl">
            {link ? 'Convite enviado' : 'Convidar pessoa'}
          </SheetTitle>
          <SheetDescription>
            {link
              ? 'Mandamos o link para o e-mail da pessoa. Você também pode mandar por fora.'
              : 'A pessoa recebe um link para escolher o @ e a senha.'}
          </SheetDescription>
        </SheetHeader>
        {link ? (
          <SentStep
            link={link}
            clipboard={clipboard}
            onAnother={() => fetcher.reset()}
            onClose={onClose}
          />
        ) : (
          <InviteForm
            busy={fetcher.busy}
            failure={usersFailureOf(settled)}
            ownerOf={ownerOf}
            onInvite={(input) => fetcher.send({ intent: 'invite', ...input })}
            onResend={onResend}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SentStep({
  link,
  clipboard,
  onAnother,
  onClose,
}: Readonly<{
  link: string;
  clipboard: Clipboard;
  onAnother: () => void;
  onClose: () => void;
}>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <ShareLinkPanel
        link={link}
        fieldLabel="Link do convite"
        note="O link vale 7 dias e só funciona uma vez. Ele não aparece de novo depois que você fechar."
        clipboard={clipboard}
      />
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="lg" onClick={onAnother}>
          Convidar outra pessoa
        </Button>
        <Button size="lg" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
