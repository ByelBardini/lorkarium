import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useState, type Ref } from 'react';
import { Input } from '@/components/ui/input';

export type PasswordFieldProps = Readonly<{
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  invalid: boolean;
  describedBy?: string;
  ref?: Ref<HTMLInputElement>;
}>;

/** Password input with a show/hide toggle whose accessible name says what it will do.
 *
 *  Example: `<PasswordField id={id} value={password} onValueChange={setPassword} invalid={false} />` */
export function PasswordField({
  id,
  value,
  onValueChange,
  invalid,
  describedBy,
  ref,
}: PasswordFieldProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const ToggleIcon = visible ? EyeOffIcon : EyeIcon;
  return (
    <div className="relative">
      <Input
        ref={ref}
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete="current-password"
        placeholder="••••••••"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="pr-13"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute top-0.5 right-0.5 flex size-11 items-center justify-center rounded-md text-placeholder transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ToggleIcon aria-hidden="true" className="size-5" strokeWidth={1.6} />
      </button>
    </div>
  );
}
