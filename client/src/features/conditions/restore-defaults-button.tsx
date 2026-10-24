import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { LoaderCircleIcon, RotateCcwIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { missingDefaultNames } from '@/lib/condition-names';
import { cn } from '@/lib/utils';
import { catalogFailureMessage, type ConditionCatalogLink } from './condition-catalog-link';

export type RestoreDefaultsButtonProps = Readonly<{
  definitions: readonly ConditionDefinitionDto[];
  link: ConditionCatalogLink;
}>;

const NOTHING_MISSING = 'Todas as condições padrão estão na lista.';

/** "Restaurar padrões": brings back the default conditions missing from the list, by name (an
 *  edited one or the master's own stay as they are). Nothing missing → disabled, saying so.
 *
 *  Example: `<RestoreDefaultsButton definitions={definitions} link={link} />` */
export function RestoreDefaultsButton({ definitions, link }: RestoreDefaultsButtonProps) {
  const hintId = useId();
  const { busy, refusal, restore } = useRestore(link);
  const missing = missingDefaultNames(definitions);
  const Icon = busy ? LoaderCircleIcon : RotateCcwIcon;
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={busy || missing.length === 0}
        aria-busy={busy}
        aria-describedby={hintId}
        onClick={restore}
      >
        <Icon aria-hidden="true" className={cn(busy && 'animate-spin')} />
        Restaurar padrões
      </Button>
      <p
        id={hintId}
        role="status"
        // Nothing missing only explains the disabled button: said to the reader, not shown.
        className={cn(
          'max-w-xs text-[13px]',
          refusal ? 'text-destructive-text' : 'text-placeholder',
          !refusal && missing.length === 0 && 'sr-only',
        )}
      >
        {refusal ?? (missing.length === 0 ? NOTHING_MISSING : missingText(missing))}
      </p>
    </div>
  );
}

type Restore = Readonly<{ busy: boolean; refusal: string | null; restore: () => void }>;

// Only a refusal is kept: once restored, the list and the hint show what came back.
function useRestore(link: ConditionCatalogLink): Restore {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const restore = (): void => {
    setBusy(true);
    void link.commands.restoreDefaultConditions(link.scope).then((result) => {
      setBusy(false);
      setRefusal(result.ok ? null : catalogFailureMessage(result.failure));
    });
  };
  return { busy, refusal, restore };
}

function missingText(missing: readonly string[]): string {
  const names = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' });
  return `Faltam: ${names.format(missing)}.`;
}
