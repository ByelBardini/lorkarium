import { useId } from 'react';
import type { Clipboard } from '@/services/clipboard';
import { CopyReferenceButton } from './copy-reference-button';
import {
  CALL_DETAIL_LABELS,
  ERRORS_INTRO,
  ERRORS_TABLE_HEAD,
  ERROR_HANDLING_EXAMPLE,
  FIND_BAR_EXAMPLE,
  FIND_BAR_STEPS,
  FULL_EXAMPLE,
  INPUT_BINDING_EXAMPLE,
  INPUT_BINDING_TITLE,
  REFERENCE_TITLES,
  SDK_CALLS,
  SHEET_ERROR_CODES,
  SHEET_LIFECYCLE_STEPS,
  SHEET_LIFECYCLE_WARNING,
  SHEET_LIMITS,
  SHEET_STATE_FIELDS,
  STATE_INTRO,
  STATE_TABLE_HEAD,
  TOKEN_IMAGE_CAPTION,
  TOKEN_IMAGE_EXAMPLE,
  VALUES_EXAMPLE,
  VALUES_INTRO,
  type ReferenceRow,
  type SdkCallDoc,
} from './sheet-api-reference-content';

/** What the template author can call from the sheet (`window.lorkarium`), how the sheet talks to
 *  the table, the state, the errors and the limits, beside the editor; with a clipboard, it
 *  offers "Copiar documentação" (the same reference in Markdown).
 *
 *  Example: `<SheetApiReference clipboard={deps.clipboard} />` */
export function SheetApiReference({
  clipboard,
}: Readonly<{ clipboard?: Clipboard }>): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1 text-sm">
      {clipboard && <CopyReferenceButton clipboard={clipboard} />}
      <LifecycleSection />
      <StateSection />
      <ReferenceSection title={REFERENCE_TITLES.calls}>
        <dl className="flex flex-col gap-4">
          {SDK_CALLS.map((call) => (
            <SdkCallEntry key={call.signature} call={call} />
          ))}
        </dl>
      </ReferenceSection>
      <FindBarSection />
      <ValuesSection />
      <ErrorsSection />
      <ReferenceSection title={REFERENCE_TITLES.fullExample}>
        <CodeBlock code={FULL_EXAMPLE} />
      </ReferenceSection>
      <ReferenceSection title={REFERENCE_TITLES.limits}>
        <BulletList items={SHEET_LIMITS} />
      </ReferenceSection>
    </div>
  );
}

function LifecycleSection(): React.JSX.Element {
  return (
    <ReferenceSection title={REFERENCE_TITLES.lifecycle}>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        {SHEET_LIFECYCLE_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="rounded-sm border border-border px-2 py-1 text-foreground">
        {SHEET_LIFECYCLE_WARNING}
      </p>
    </ReferenceSection>
  );
}

function StateSection(): React.JSX.Element {
  return (
    <ReferenceSection title={REFERENCE_TITLES.state}>
      <p className="text-muted-foreground">{STATE_INTRO}</p>
      <ReferenceTable
        caption="Campos do estado"
        head={STATE_TABLE_HEAD}
        rows={SHEET_STATE_FIELDS}
      />
      <p className="text-muted-foreground">{TOKEN_IMAGE_CAPTION}</p>
      <CodeBlock code={TOKEN_IMAGE_EXAMPLE} />
    </ReferenceSection>
  );
}

function FindBarSection(): React.JSX.Element {
  return (
    <ReferenceSection title={REFERENCE_TITLES.findBar}>
      <BulletList items={FIND_BAR_STEPS} />
      <CodeBlock code={FIND_BAR_EXAMPLE} />
    </ReferenceSection>
  );
}

function ValuesSection(): React.JSX.Element {
  return (
    <ReferenceSection title={REFERENCE_TITLES.values}>
      <p className="text-muted-foreground">{VALUES_INTRO}</p>
      <CodeBlock code={VALUES_EXAMPLE} />
      <h4 className="text-xs font-semibold text-foreground">{INPUT_BINDING_TITLE}</h4>
      <CodeBlock code={INPUT_BINDING_EXAMPLE} />
    </ReferenceSection>
  );
}

function ErrorsSection(): React.JSX.Element {
  return (
    <ReferenceSection title={REFERENCE_TITLES.errors}>
      <p className="text-muted-foreground">{ERRORS_INTRO}</p>
      <ReferenceTable caption="Códigos de erro" head={ERRORS_TABLE_HEAD} rows={SHEET_ERROR_CODES} />
      <CodeBlock code={ERROR_HANDLING_EXAMPLE} />
    </ReferenceSection>
  );
}

function SdkCallEntry({ call }: Readonly<{ call: SdkCallDoc }>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-border p-2">
      <dt className="font-mono text-xs text-primary">{call.signature}</dt>
      <dd className="text-muted-foreground">{call.summary}</dd>
      {call.params.length > 0 && (
        <dd>
          <DetailLabel>{CALL_DETAIL_LABELS.params}</DetailLabel>
          <ul className="pl-4 text-muted-foreground">
            {call.params.map(([name, text]) => (
              <li key={name}>
                <code className="font-mono text-xs text-foreground">{name}</code>: {text}
              </li>
            ))}
          </ul>
        </dd>
      )}
      <dd className="text-muted-foreground">
        <DetailLabel>{CALL_DETAIL_LABELS.returns}</DetailLabel> {call.returns}
      </dd>
      {call.errors.length > 0 && (
        <dd className="text-muted-foreground">
          <DetailLabel>{CALL_DETAIL_LABELS.errors}</DetailLabel> {call.errors.join(', ')}
        </dd>
      )}
      <dd>
        <CodeBlock code={call.example} />
      </dd>
    </div>
  );
}

function DetailLabel({ children }: Readonly<{ children: string }>): React.JSX.Element {
  return <span className="text-xs font-semibold text-label">{children}:</span>;
}

type ReferenceSectionProps = Readonly<{ title: string; children: React.ReactNode }>;

function ReferenceSection({ title, children }: ReferenceSectionProps): React.JSX.Element {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-xs font-semibold tracking-wide text-label uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

type ReferenceTableProps = Readonly<{
  caption: string;
  head: readonly [string, string];
  rows: readonly ReferenceRow[];
}>;

function ReferenceTable({ caption, head, rows }: ReferenceTableProps): React.JSX.Element {
  return (
    <table className="w-full border-collapse text-left text-xs">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border text-label">
          <th className="py-1 pr-2 font-semibold">{head[0]}</th>
          <th className="py-1 font-semibold">{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, text]) => (
          <tr key={name} className="border-b border-border/60 align-top">
            <th
              scope="row"
              className="py-1 pr-2 font-mono font-normal whitespace-nowrap text-primary"
            >
              {name}
            </th>
            <td className="py-1 text-muted-foreground">{text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BulletList({ items }: Readonly<{ items: readonly string[] }>): React.JSX.Element {
  return (
    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function CodeBlock({ code }: Readonly<{ code: string }>): React.JSX.Element {
  return (
    <pre className="overflow-x-auto rounded-sm bg-background px-2 py-1.5 font-mono text-xs leading-relaxed">
      <code>{code}</code>
    </pre>
  );
}
