import { SearchIcon } from 'lucide-react';
import { SegmentField } from '@/components/segment-field';
import { Input } from '@/components/ui/input';
import {
  STATUS_FILTERS,
  type DirectoryFilters,
  type RoleFilter,
  type StatusFilter,
} from '@/lib/user-directory';
import { cn } from '@/lib/utils';

const STATUS_TAB: Readonly<Record<StatusFilter, string>> = {
  all: 'Todos',
  active: 'Ativos',
  invited: 'Convidados',
  suspended: 'Suspensos',
};

const ROLE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'Usuário' },
] as const satisfies ReadonlyArray<{ value: RoleFilter; label: string }>;

export type UsersToolbarProps = Readonly<{
  filters: DirectoryFilters;
  counts: Readonly<Record<StatusFilter, number>>;
  onChange: (filters: DirectoryFilters) => void;
}>;

/** Search (nickname, @ or e-mail), the status tabs with their counts and the role, all with an
 *  immediate effect.
 *
 *  Example: `<UsersToolbar filters={filters} counts={counts} onChange={setFilters} />` */
export function UsersToolbar({ filters, counts, onChange }: UsersToolbarProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <div className="relative w-full max-w-sm">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-4 left-3.5 size-4 text-placeholder"
        />
        <Input
          type="search"
          aria-label="Buscar usuário"
          placeholder="Apelido, @ ou e-mail"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          className="pl-10"
        />
      </div>
      <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-5">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={filters.status === status}
            onClick={() => onChange({ ...filters, status })}
            className={cn(
              'h-10 border-b-2 text-sm font-medium',
              filters.status === status
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {STATUS_TAB[status]} <span className="tabular-nums">{counts[status]}</span>
          </button>
        ))}
      </div>
      <SegmentField
        legend="Papel"
        value={filters.role}
        options={ROLE_OPTIONS}
        onChange={(role) => onChange({ ...filters, role })}
        compact
      />
    </div>
  );
}
