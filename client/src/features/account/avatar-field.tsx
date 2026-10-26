import type { ProfileDto } from '@lorkarium/contracts';
import { ImageUpIcon, Link2Icon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { useId, useState, type DragEvent } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { ImageLinkField } from '@/components/image-source-buttons';
import type { ImageSender } from '@/components/use-image-sender';
import { UserAvatar } from '@/components/user-avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { AVATAR_ACCEPT } from '@/lib/avatar-file';
import { cn } from '@/lib/utils';
import type { ProfileApi } from '@/services/profile-api';
import type { SessionStore } from '@/stores/session-store';
import { accountFailureMessage, type AccountFailure } from './account-messages';
import { failureOf, useAccountFetcher } from './use-account-fetcher';
import { useAvatarUpload, type ProfileImageUpload } from './use-profile-image-upload';

export type AvatarFieldProps = Readonly<{
  profile: ProfileDto;
  profileApi: ProfileApi;
  sessionStore: StoreApi<SessionStore>;
}>;

/** "Foto": the circle takes a dropped file, "Escolher foto" opens the picker and "Tirar foto"
 *  goes back to the initials. The photo is saved on its own, never through the profile bar.
 *
 *  Example: `<AvatarField profile={profile} profileApi={profileApi} sessionStore={sessionStore} />` */
export function AvatarField({
  profile,
  profileApi,
  sessionStore,
}: AvatarFieldProps): React.JSX.Element {
  const upload = useAvatarUpload(profileApi, sessionStore);
  const [linking, setLinking] = useState(false);
  const removal = useAccountFetcher();
  const removalFailure = failureOf(removal.settled);
  const hintId = useId();
  return (
    <fieldset className="flex flex-col gap-3" aria-busy={upload.sending || removal.busy}>
      <legend className="mb-1 text-[13px] font-medium text-label">Foto</legend>
      <div className="flex flex-wrap items-center gap-5">
        <AvatarDropArea profile={profile} hintId={hintId} onFile={upload.send} />
        <div className="flex flex-col items-start gap-2">
          <AvatarButtons
            hasPhoto={profile.avatarId !== null}
            sending={upload.sending}
            removing={removal.busy}
            onFile={upload.send}
            onRemove={() => removal.send({ intent: 'avatar-remove' })}
            onLink={() => setLinking(true)}
          />
          {linking && (
            <div className="w-full max-w-sm">
              <ImageLinkField sender={linkSenderOf(upload)} onDone={() => setLinking(false)} />
            </div>
          )}
          <p id={hintId} className="max-w-prose text-[13px] text-placeholder">
            Arraste para o círculo, escolha ou use um link · PNG, JPEG, WebP ou GIF (animado também)
            até 5 MB. Sem foto, usamos suas iniciais na sua cor.
          </p>
        </div>
      </div>
      <AvatarFailure failure={upload.failure ?? removalFailure} />
    </fieldset>
  );
}

type DropAreaProps = Readonly<{
  profile: ProfileDto;
  hintId: string;
  onFile: (file: File) => void;
}>;

function AvatarDropArea({ profile, hintId, onFile }: DropAreaProps): React.JSX.Element {
  const [over, setOver] = useState(false);
  const drop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };
  return (
    <div
      role="group"
      aria-label="Área da foto"
      aria-describedby={hintId}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn(
        'relative rounded-full outline-2 outline-offset-4',
        over ? 'outline-primary' : 'outline-transparent',
      )}
    >
      <UserAvatar
        name={profile.name}
        color={profile.color}
        avatarId={profile.avatarId}
        size="xl"
        alt="Sua foto"
        className="size-24 text-3xl"
      />
      {over && (
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/70 text-sm font-medium text-foreground">
          Solta aqui
        </span>
      )}
    </div>
  );
}

type AvatarButtonsProps = Readonly<{
  hasPhoto: boolean;
  sending: boolean;
  removing: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
  onLink: () => void;
}>;

// The link field of the table images, over the photo's own send (its refusal shows below).
function linkSenderOf(upload: ProfileImageUpload): ImageSender {
  return {
    accept: AVATAR_ACCEPT,
    busy: upload.sending,
    problem: null,
    sendFile: () => undefined,
    sendLink: upload.sendLink,
  };
}

function AvatarButtons(props: AvatarButtonsProps): React.JSX.Element {
  const busy = props.sending || props.removing;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        className={cn(
          buttonVariants({ variant: 'outline', size: 'lg' }),
          'cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
          busy && 'pointer-events-none opacity-50',
        )}
      >
        {props.sending ? (
          <Loader2Icon aria-hidden="true" className="animate-spin" />
        ) : (
          <ImageUpIcon aria-hidden="true" />
        )}
        {props.sending ? 'Enviando…' : 'Escolher foto'}
        <input
          type="file"
          accept={AVATAR_ACCEPT}
          aria-label="Escolher foto"
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) props.onFile(file);
          }}
        />
      </label>
      <Button type="button" variant="outline" size="lg" disabled={busy} onClick={props.onLink}>
        <Link2Icon aria-hidden="true" />
        Usar um link
      </Button>
      {props.hasPhoto && (
        <Button type="button" variant="ghost" size="lg" disabled={busy} onClick={props.onRemove}>
          <Trash2Icon aria-hidden="true" />
          {props.removing ? 'Tirando…' : 'Tirar foto'}
        </Button>
      )}
    </div>
  );
}

function AvatarFailure({ failure }: Readonly<{ failure: AccountFailure | null }>) {
  if (!failure) return null;
  return (
    <p role="alert" className="text-[13px] text-destructive-text">
      {accountFailureMessage(failure)}
    </p>
  );
}
