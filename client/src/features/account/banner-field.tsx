import type { ProfileDto } from '@lorkarium/contracts';
import { useContext, useId, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { ImageCropDialog, type CropAreaComponent } from '@/components/image-crop/image-crop-dialog';
import { ImageSourceButtons } from '@/components/image-source-buttons';
import { PlanSeal } from '@/components/plan-seal';
import type { ImageSender } from '@/components/use-image-sender';
import { AVATAR_ACCEPT } from '@/lib/avatar-file';
import { PLAN_FEATURE_LABEL } from '@/lib/plan-limit-message';
import { bannerUrlOf } from '@/lib/banner-url';
import { memberColorCss } from '@/lib/member-color';
import type { ProfileApi } from '@/services/profile-api';
import type { ImageCropRect } from '@/services/assets-api';
import type { SessionStore } from '@/stores/session-store';
import { customizationGate } from '@/features/plans/plan-gate';
import { AccountPlanContext } from '@/features/plans/use-plan-limits';
import { accountFailureMessage } from './account-messages';
import { SettingsRow } from './settings-row';
import { failureOf, useAccountFetcher } from './use-account-fetcher';
import { useBannerUpload, type ProfileImageUpload } from './use-profile-image-upload';

export type BannerFieldProps = Readonly<{
  profile: ProfileDto;
  profileApi: ProfileApi;
  sessionStore: StoreApi<SessionStore>;
  /** The crop area of the dialog; the lazy `react-easy-crop` one by default (a spec passes a fake). */
  cropArea?: CropAreaComponent;
}>;

// The account customizations open together: the seal shown is the cheapest plan that has them.
const REQUIRED_SEAL = { plan: 'apoiador', admin: false, lorkariumOwner: false } as const;

/** "Banner": the 3:1 image on top of the card. Grátis sees it locked with the Apoiador seal; a paid
 *  plan picks a file, frames it in the 3:1 crop and sends it on its own, like the photo.
 *
 *  Example: `<BannerField profile={profile} profileApi={profileApi} sessionStore={sessionStore} />` */
export function BannerField(props: BannerFieldProps): React.JSX.Element {
  const account = useContext(AccountPlanContext);
  const gate = customizationGate(account?.customization ?? null);
  const hintId = useId();
  return (
    <SettingsRow
      title="Banner"
      group
      descriptionId={hintId}
      description="A faixa no topo do seu cartão, em 3:1 · PNG, JPEG, WebP ou GIF (animado) até 5 MB. Sem banner, vale a sua cor."
    >
      {gate.open ? <BannerControls {...props} /> : <BannerLocked hint={gate.hint} />}
    </SettingsRow>
  );
}

function BannerLocked({ hint }: Readonly<{ hint: string }>): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 border border-divider px-4 py-3">
      <PlanSeal holder={REQUIRED_SEAL} className="text-2xl" />
      <div className="flex flex-col gap-0.5 text-sm">
        <p className="text-label">{PLAN_FEATURE_LABEL.profileBanner} nos planos pagos.</p>
        <p className="text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function BannerControls(props: BannerFieldProps): React.JSX.Element {
  const upload = useBannerUpload(props.profileApi, props.sessionStore);
  const removal = useAccountFetcher();
  const [pending, setPending] = useState<File | null>(null);
  // The server cuts the rectangle on every frame: a canvas here would freeze a GIF.
  const confirm = (rect: ImageCropRect): void => {
    if (pending === null) return;
    setPending(null);
    upload.send(pending, rect);
  };
  return (
    <div className="flex flex-col gap-3">
      <BannerImage profile={props.profile} />
      <ImageSourceButtons
        sender={bannerSenderOf(upload, failureOf(removal.settled), setPending)}
        hasImage={props.profile.bannerId !== null}
        removeLabel="Tirar banner"
        onRemove={() => removal.send({ intent: 'banner-remove' })}
      />
      {pending && (
        <ImageCropDialog
          file={pending}
          purpose="campaign_banner"
          title="Recortar o banner do perfil"
          CropArea={props.cropArea}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function BannerImage({ profile }: Readonly<{ profile: ProfileDto }>): React.JSX.Element {
  return (
    <div
      className="aspect-[3/1] w-full overflow-hidden border border-divider"
      style={{ backgroundColor: memberColorCss(profile.colorChoice ?? profile.color) }}
    >
      {profile.bannerId !== null && (
        <img
          data-testid="banner-field-image"
          src={bannerUrlOf(profile.bannerId)}
          alt="Seu banner"
          className="size-full object-cover"
        />
      )}
    </div>
  );
}

// A file waits for the crop; a link goes straight (the server centers it in 3:1).
function bannerSenderOf(
  upload: ProfileImageUpload,
  removalFailure: ReturnType<typeof failureOf>,
  pick: (file: File) => void,
): ImageSender {
  const failure = upload.failure ?? removalFailure;
  return {
    accept: AVATAR_ACCEPT,
    busy: upload.sending,
    problem: failure ? accountFailureMessage(failure) : null,
    sendFile: (file) => {
      if (file) pick(file);
    },
    sendLink: upload.sendLink,
  };
}
