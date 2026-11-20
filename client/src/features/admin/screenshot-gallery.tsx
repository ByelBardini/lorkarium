import type { ScreenshotDto } from '@lorkarium/contracts';
import { reportShotsLabel } from './reports-text';

export type ScreenshotGalleryProps = Readonly<{
  shots: readonly ScreenshotDto[];
  /** The admin route of one screenshot (`reportAttachmentUrlOf`, `feedbackAttachmentUrlOf`). */
  urlOf: (shotId: string) => string;
}>;

/** "N prints" of a report or a feedback entry as thumbnails, each opening at its full size in a
 *  new tab; "Sem prints" when there is none.
 *
 *  Example: `<ScreenshotGallery shots={report.attachments} urlOf={(id) => reportAttachmentUrlOf(report.id, id)} />` */
export function ScreenshotGallery({ shots, urlOf }: ScreenshotGalleryProps): React.JSX.Element {
  const label = reportShotsLabel(shots.length);
  if (shots.length === 0) return <p className="text-sm text-muted-foreground">{label}</p>;
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <h3 className="text-[13px] text-label">{label}</h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shots.map((shot, index) => (
          <li key={shot.id}>
            <a
              href={urlOf(shot.id)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir o print ${index + 1} em tamanho real`}
              className="block overflow-hidden rounded-md border border-border bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <img
                src={urlOf(shot.id)}
                alt={`Print ${index + 1}`}
                width={shot.width}
                height={shot.height}
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
