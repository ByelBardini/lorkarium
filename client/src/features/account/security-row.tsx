/** The dialog of the section that is open, if any (only one at a time, mounted only while open). */
export type SecurityDialog =
  'password' | 'email' | 'two-factor-setup' | 'two-factor-disable' | 'recovery-codes';

type SecurityRowProps = Readonly<{
  label: string;
  value: React.ReactNode;
  children: React.ReactNode;
}>;

/** One line of "Conta e segurança": what it is, how it stands, and its buttons.
 *
 *  Example: `<SecurityRow label="Senha" value="Trocada há 3 meses"><Button>Trocar senha</Button></SecurityRow>` */
export function SecurityRow({ label, value, children }: SecurityRowProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-divider py-4">
      <div className="mr-auto flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-label">{label}</span>
        <div className="text-[15px] text-foreground">{value}</div>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
