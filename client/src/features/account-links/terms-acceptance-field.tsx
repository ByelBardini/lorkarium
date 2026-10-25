import { LegalDocumentLink } from '@/components/legal-document-link';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export type TermsAcceptanceFieldProps = Readonly<{
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error: string | undefined;
}>;

/** The box the person ticks to accept the Terms of use and the Privacy policy (the clickwrap the
 *  server records); each text opens in a new tab without ticking it.
 *
 *  Example: `<TermsAcceptanceField id={id} checked={accepted} onCheckedChange={setAccepted} error={errors.terms} />` */
export function TermsAcceptanceField({
  id,
  checked,
  onCheckedChange,
  error,
}: TermsAcceptanceFieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(state) => onCheckedChange(state === true)}
          aria-invalid={error !== undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5"
        />
        <Label
          htmlFor={id}
          className="block cursor-pointer text-sm leading-snug font-normal text-muted-foreground"
        >
          Li e aceito os <LegalDocumentLink document="terms" /> e a{' '}
          <LegalDocumentLink document="privacy" />
        </Label>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-[13px] text-destructive-text">
          {error}
        </p>
      )}
    </div>
  );
}
