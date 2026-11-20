import { LegalDocumentLink } from '@/components/legal-document-link';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export type TermsAcceptanceFieldProps = Readonly<{
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error: string | undefined;
}>;

/** The box the person ticks to declare being 18 or older (the Terms already require it) and to
 *  accept the Terms of use, the Privacy policy and the Acceptable use
 *  policy (the clickwrap the server records, one version for the three); each text opens in a new
 *  tab without ticking it.
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
          Tenho 18 anos ou mais e li e aceito os <LegalDocumentLink document="terms" />, a{' '}
          <LegalDocumentLink document="privacy" /> e a{' '}
          <LegalDocumentLink document="acceptable-use" />
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
