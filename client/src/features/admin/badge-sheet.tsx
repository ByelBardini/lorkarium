import {
  BADGE_DESCRIPTION_MAX_LENGTH,
  BADGE_NAME_MAX_LENGTH,
  type AdminBadgeDto,
} from '@lorkarium/contracts';
import { ImageUpIcon, Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { FormField } from '@/components/form-field';
import type { CropAreaComponent } from '@/components/image-crop/image-crop-dialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useImageDataUrl } from '@/lib/use-image-data-url';
import type { ImageCropRect } from '@/services/assets-api';
import type { BadgesAdminApi } from '@/services/badges-admin-api';
import { badgeFailureMessage } from './admin-messages';
import type { BadgesActionResult } from './badges-action';
import { useBadgeImagePick, useBadgeImageSend } from './badge-image';
import { badgesFailureOf, useBadgesFetcher, useOnBadgesSettled } from './use-badges-fetcher';

/** A framed image waiting for the badge to exist. */
type ChosenImage = Readonly<{ file: File; crop: ImageCropRect }>;

type BadgeTextErrors = Readonly<{ name?: string; description?: string }>;

export type BadgeSheetProps = Readonly<{
  /** `null` creates a badge; a badge edits its name and description. */
  badge: AdminBadgeDto | null;
  api: BadgesAdminApi;
  /** The drag-and-zoom area of the crop dialog; a spec passes a fake. */
  cropArea?: CropAreaComponent;
  /** It went through: the page writes `message` in its notice and closes the sheet. */
  onDone: (message: string) => void;
  onClose: () => void;
}>;

/** "Nova insígnia" (name, description, the 1:1 image) or "Editar insígnia" (the texts). Creating
 *  sends the texts, then the image; an image refused after the badge exists is told here and the
 *  row stays "Sem imagem".
 *
 *  Example: `<BadgeSheet badge={null} api={api} onDone={setNotice} onClose={close} />` */
export function BadgeSheet(props: BadgeSheetProps): React.JSX.Element {
  const creating = props.badge === null;
  const [imageRefused, setImageRefused] = useState<string | null>(null);
  return (
    <Sheet open onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent className="w-full gap-6 overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader className="p-0">
          <SheetTitle className="font-display text-2xl">
            {creating ? 'Nova insígnia' : 'Editar insígnia'}
          </SheetTitle>
          <SheetDescription>
            O nome e a descrição aparecem ao passar o mouse na insígnia, no card de perfil.
          </SheetDescription>
        </SheetHeader>
        {imageRefused ? (
          <ImageRefusedStep problem={imageRefused} onClose={props.onClose} />
        ) : (
          <BadgeForm {...props} onImageRefused={setImageRefused} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ImageRefusedStep({
  problem,
  onClose,
}: Readonly<{ problem: string; onClose: () => void }>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      <Alert variant="destructive" className="px-3.5 py-3 text-sm">
        A insígnia foi criada, mas a imagem não foi. {problem} Envie outra pela linha dela.
      </Alert>
      <Button size="lg" onClick={onClose}>
        Voltar à lista
      </Button>
    </div>
  );
}

type BadgeFormProps = BadgeSheetProps & Readonly<{ onImageRefused: (problem: string) => void }>;

function BadgeForm(props: BadgeFormProps): React.JSX.Element {
  const nameId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(props.badge?.name ?? '');
  const [description, setDescription] = useState(props.badge?.description ?? '');
  const [errors, setErrors] = useState<BadgeTextErrors>({});
  const [chosen, setChosen] = useState<ChosenImage | null>(null);
  const fetcher = useBadgesFetcher();
  const image = useBadgeImageSend(props.api);
  useOnBadgesSettled(
    fetcher.settled,
    (result) => void settle(result, chosen, props, image.send, setErrors),
  );
  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const problems = textProblems(name, description);
    setErrors(problems);
    if (problems.name || problems.description) return;
    const texts = { name: name.trim(), description: description.trim() };
    if (props.badge) fetcher.send({ intent: 'update', badgeId: props.badge.id, ...texts });
    else fetcher.send({ intent: 'create', ...texts });
  };
  const busy = fetcher.busy || image.sending;
  const failure = badgesFailureOf(fetcher.settled);
  return (
    <form noValidate onSubmit={submit} aria-busy={busy} className="flex flex-col gap-5">
      <FormField id={nameId} label="Nome" error={errors.name}>
        <Input
          id={nameId}
          autoFocus
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name !== undefined}
          aria-describedby={errors.name ? `${nameId}-error` : undefined}
        />
      </FormField>
      <FormField id={descriptionId} label="Descrição" error={errors.description}>
        <Textarea
          id={descriptionId}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-invalid={errors.description !== undefined}
          aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
        />
      </FormField>
      {props.badge === null && (
        <BadgeImageField chosen={chosen} onChosen={setChosen} cropArea={props.cropArea} />
      )}
      {failure && failure.kind !== 'name_taken' && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {badgeFailureMessage(failure)}
        </Alert>
      )}
      <SubmitButton creating={props.badge === null} busy={busy} />
    </form>
  );
}

// After the texts are kept: the image of a new badge, then the notice; a taken name is the field's.
async function settle(
  result: BadgesActionResult,
  chosen: ChosenImage | null,
  props: BadgeFormProps,
  sendImage: ReturnType<typeof useBadgeImageSend>['send'],
  setErrors: (errors: BadgeTextErrors) => void,
): Promise<void> {
  if ('failure' in result) {
    if (result.failure.kind === 'name_taken')
      setErrors({ name: badgeFailureMessage(result.failure) });
    return;
  }
  if (!('badge' in result)) return;
  const { badge } = result;
  if (result.intent === 'update') return props.onDone(`“${badge.name}” salva.`);
  const problem = chosen ? await sendImage(badge.id, chosen.file, chosen.crop) : null;
  if (problem) return props.onImageRefused(problem);
  props.onDone(`“${badge.name}” criada.`);
}

function textProblems(name: string, description: string): BadgeTextErrors {
  return { name: nameProblem(name.trim()), description: descriptionProblem(description.trim()) };
}

function nameProblem(name: string): string | undefined {
  if (name === '') return 'Informe o nome da insígnia.';
  if (name.length > BADGE_NAME_MAX_LENGTH)
    return `O nome passa de ${BADGE_NAME_MAX_LENGTH} caracteres.`;
  return undefined;
}

function descriptionProblem(description: string): string | undefined {
  if (description === '') return 'Informe a descrição da insígnia.';
  if (description.length > BADGE_DESCRIPTION_MAX_LENGTH)
    return `A descrição passa de ${BADGE_DESCRIPTION_MAX_LENGTH} caracteres.`;
  return undefined;
}

function SubmitButton({ creating, busy }: Readonly<{ creating: boolean; busy: boolean }>) {
  const idle = creating ? 'Criar' : 'Salvar';
  const working = creating ? 'Criando…' : 'Salvando…';
  return (
    <Button type="submit" size="xl" disabled={busy}>
      {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
      {busy ? working : idle}
    </Button>
  );
}

type BadgeImageFieldProps = Readonly<{
  chosen: ChosenImage | null;
  onChosen: (chosen: ChosenImage) => void;
  cropArea?: CropAreaComponent;
}>;

function BadgeImageField({ chosen, onChosen, cropArea }: BadgeImageFieldProps) {
  const pick = useBadgeImagePick((file, crop) => onChosen({ file, crop }), cropArea);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-[13px] font-medium text-label">Imagem</legend>
      <div className="flex items-center gap-3">
        {chosen && <BadgeCropPreview chosen={chosen} />}
        <Button type="button" variant="outline" className="h-9 flex-1" onClick={pick.open}>
          <ImageUpIcon aria-hidden="true" />
          {chosen ? 'Trocar imagem' : 'Escolher imagem'}
        </Button>
      </div>
      <p className="text-[13px] text-placeholder">Quadrada · PNG, JPEG, WebP ou GIF até 2 MB.</p>
      {pick.problem && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {pick.problem}
        </Alert>
      )}
      {pick.element}
    </fieldset>
  );
}

// The server cuts the rectangle; here the same square is shown by scaling the whole image.
function BadgeCropPreview({ chosen }: Readonly<{ chosen: ChosenImage }>): React.JSX.Element {
  const url = useImageDataUrl(chosen.file);
  const { x, y, width, height } = chosen.crop;
  const style: React.CSSProperties = {
    width: `${10000 / width}%`,
    height: `${10000 / height}%`,
    left: `${(-x * 100) / width}%`,
    top: `${(-y * 100) / height}%`,
  };
  return (
    <div className="relative size-16 shrink-0 overflow-hidden border border-border bg-card">
      {url && (
        <img src={url} alt="Prévia da insígnia" className="absolute max-w-none" style={style} />
      )}
    </div>
  );
}
