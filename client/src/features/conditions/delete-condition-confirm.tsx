import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { LoaderCircleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { BoardCommandFailure } from '@/services/table-board-commands';
import {
  catalogFailureMessage,
  usageText,
  type ConditionCatalogLink,
} from './condition-catalog-link';

export type DeleteConditionConfirmProps = Readonly<{
  definition: ConditionDefinitionDto;
  link: ConditionCatalogLink;
  onClose: () => void;
}>;

type Usage = Readonly<{ kind: 'counting' }> | Readonly<{ kind: 'counted'; text: string }>;

/** "Excluir Cego?": how many tokens hold it (asked to the server, which sees every grid), then
 *  "Excluir" or "Manter". Confirmed, the condition leaves the list and every token; a refusal
 *  stays in the dialog. Mounted only while open.
 *
 *  Example: `{deleting && <DeleteConditionConfirm definition={deleting} link={link} onClose={close} />}` */
export function DeleteConditionConfirm(props: DeleteConditionConfirmProps): React.JSX.Element {
  const usage = useUsage(props.link, props.definition.id);
  const refocusOpener = useRefocusOpener();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<BoardCommandFailure | null>(null);
  const confirm = async (): Promise<void> => {
    setBusy(true);
    const { scope, commands } = props.link;
    const result = await commands.deleteConditionDefinition(scope, props.definition.id);
    if (result.ok) return props.onClose();
    setBusy(false);
    setFailure(result.failure);
  };
  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && props.onClose()}>
      <AlertDialogContent onCloseAutoFocus={refocusOpener}>
        <DeleteHeader name={props.definition.name} usage={usage} />
        {failure && (
          <p role="alert" className="text-sm text-destructive-text">
            {catalogFailureMessage(failure)}
          </p>
        )}
        <DeleteFooter busy={busy} onConfirm={() => void confirm()} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Mounted on its own (no AlertDialogTrigger): Radix would drop the focus on the body, so it goes
// back to what opened the dialog ("Excluir Cego").
function useRefocusOpener(): (event: Event) => void {
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  return (event) => {
    event.preventDefault();
    opener?.focus();
  };
}

function useUsage(link: ConditionCatalogLink, conditionId: string): Usage {
  const [usage, setUsage] = useState<Usage>({ kind: 'counting' });
  const { commands } = link;
  const { campaignId, sceneId } = link.scope;
  // Asked once per opening: the scope's fields, not the link object, decide when to ask again.
  useEffect(() => {
    let current = true;
    void commands.conditionUsage({ campaignId, sceneId }, conditionId).then((result) => {
      if (!current) return;
      const text = result.ok ? usageText(result.tokens) : catalogFailureMessage(result.failure);
      setUsage({ kind: 'counted', text });
    });
    return () => {
      current = false;
    };
  }, [commands, campaignId, sceneId, conditionId]);
  return usage;
}

function DeleteHeader({ name, usage }: Readonly<{ name: string; usage: Usage }>) {
  return (
    <AlertDialogHeader>
      <AlertDialogTitle>{`Excluir ${name}?`}</AlertDialogTitle>
      <AlertDialogDescription aria-live="polite">
        {usage.kind === 'counting' ? 'Contando os tokens com essa condição…' : usage.text}
      </AlertDialogDescription>
    </AlertDialogHeader>
  );
}

function DeleteFooter({ busy, onConfirm }: Readonly<{ busy: boolean; onConfirm: () => void }>) {
  return (
    <AlertDialogFooter>
      <AlertDialogCancel size="lg" disabled={busy}>
        Manter
      </AlertDialogCancel>
      {/* Not an AlertDialogAction: it would close before the server answers. */}
      <Button size="lg" variant="destructive" onClick={onConfirm} disabled={busy} aria-busy={busy}>
        {busy && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
        {busy ? 'Excluindo…' : 'Excluir'}
      </Button>
    </AlertDialogFooter>
  );
}
