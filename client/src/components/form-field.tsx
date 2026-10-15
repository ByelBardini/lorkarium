import { Label } from '@/components/ui/label';

export type FormFieldProps = Readonly<{
  id: string;
  label: string;
  error: string | undefined;
  hint?: string;
  children: React.ReactNode;
}>;

/** Label, control and the line under it: the error (`<id>-error`, for `aria-describedby`) or a hint.
 *
 *  Example: `<FormField id={id} label="E-mail" error={errors.email}><Input id={id} /></FormField>` */
export function FormField({ id, label, error, hint, children }: FormFieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-[13px] text-label">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-destructive-text">
          {error}
        </p>
      ) : (
        hint && <p className="text-[13px] text-placeholder">{hint}</p>
      )}
    </div>
  );
}
