import { SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';

export type ProfileLookupFormProps = Readonly<{
  typed: string;
  onType: (typed: string) => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
  refusal: string | null;
}>;

/** The "Buscar @usuário" field over the banner, fed by `useProfileLookup`.
 *
 *  Example: `<ProfileLookupForm {...lookup.form} />` */
export function ProfileLookupForm(props: ProfileLookupFormProps): React.JSX.Element {
  const { typed, onType, onSubmit, refusal } = props;
  return (
    <form
      role="search"
      aria-label="Buscar perfil"
      onSubmit={(event) => void onSubmit(event)}
      className="flex flex-col gap-1.5"
    >
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-[#efe3c8]/75"
        />
        <Input
          type="search"
          aria-label="Buscar @usuário"
          placeholder="Buscar @usuário"
          autoComplete="off"
          value={typed}
          onChange={(event) => onType(event.target.value)}
          className="h-9 border-white/20 bg-black/45 pl-9 text-sm text-[#efe3c8] backdrop-blur-sm placeholder:text-[#efe3c8]/70 focus-visible:border-[#efe3c8]/60"
        />
      </div>
      {refusal !== null && (
        <p role="alert" className="w-fit rounded-md bg-black/60 px-2 py-1 text-xs text-[#efe3c8]">
          {refusal}
        </p>
      )}
    </form>
  );
}
