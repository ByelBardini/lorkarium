import type { ConditionLookDto } from '@lorkarium/contracts';
import { SegmentField, type SegmentOption } from '@/components/segment-field';

type LookChoice = ConditionLookDto | 'none';

const LOOKS: readonly SegmentOption<LookChoice>[] = [
  { value: 'none', label: 'Nenhuma' },
  { value: 'invisible', label: 'Translúcido' },
  { value: 'unconscious', label: 'Desacordado' },
];

/** "Aparência no token" of a new condition: whether it changes the token itself (translucent,
 *  greyed out) or only shows as an icon ("Nenhuma", `null`).
 *
 *  Example: `<ConditionLookField value={look} onChange={setLook} />` */
export function ConditionLookField({
  value,
  onChange,
}: Readonly<{
  value: ConditionLookDto | null;
  onChange: (look: ConditionLookDto | null) => void;
}>): React.JSX.Element {
  return (
    <SegmentField
      legend="Aparência no token"
      value={value ?? 'none'}
      options={LOOKS}
      onChange={(choice) => onChange(choice === 'none' ? null : choice)}
      compact
      fill
      className="gap-1.5"
    />
  );
}
