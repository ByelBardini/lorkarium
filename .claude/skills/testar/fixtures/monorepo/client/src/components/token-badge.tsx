export function TokenBadge({ label, disabled = false }: { label: string; disabled?: boolean }) {
  return <button disabled={disabled}>{label}</button>;
}
