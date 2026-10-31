import { Button } from '@/components/ui/button';
import type { Clipboard } from '@/services/clipboard';
import type { DocumentSaveStatus } from '@/stores/document-editor-store';

const PROBLEMS: readonly DocumentSaveStatus[] = ['conflict', 'forbidden', 'failure', 'offline'];

export type DraftProblemActionsProps = Readonly<{
  status: DocumentSaveStatus;
  dirty: boolean;
  /** What "Copiar meu rascunho" puts on the clipboard, as JSON. */
  draft: unknown;
  clipboard: Clipboard;
  onDiscard: () => Promise<void>;
  /** Asks before throwing a dirty draft away; `discard` runs on the confirmation. */
  onConfirmReload: (discard: () => Promise<void>) => void;
  onRetry: () => void;
}>;

/** The way out of a draft that could not be saved: copy it, load the current version, retry.
 *  Renders nothing while saving works.
 *
 *  Example: `<DraftProblemActions status="conflict" dirty draft={draft} clipboard={clipboard} … />` */
export function DraftProblemActions(props: DraftProblemActionsProps): React.JSX.Element | null {
  if (!PROBLEMS.includes(props.status)) return null;
  return (
    <div className="flex flex-wrap gap-2 p-4">
      <Button
        variant="outline"
        onClick={() => void props.clipboard.copy(JSON.stringify(props.draft))}
      >
        Copiar meu rascunho
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          props.dirty ? props.onConfirmReload(props.onDiscard) : void props.onDiscard()
        }
      >
        Carregar versão atual
      </Button>
      {props.status === 'failure' && (
        <Button onClick={props.onRetry}>Tentar salvar novamente</Button>
      )}
    </div>
  );
}
