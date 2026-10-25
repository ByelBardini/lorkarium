import { BrandMark } from '@/components/brand-mark';
import { LegalLinks } from './legal-links';
import { LoginHeroArt } from './login-hero-art';

export type AuthFrameProps = Readonly<{
  pageTitle: string;
  heading: string;
  lead?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** The Terms of use and Privacy policy links at the foot; off where the content already has them. */
  legalLinks?: boolean;
}>;

/** The frame of the screens before the app: the illustrated panel on large screens and the column
 *  with the ornament, the heading, the content and the foot with the legal links (login,
 *  invitation, new password).
 *
 *  Example: `<AuthFrame pageTitle="Lorkarium · Entrar" heading="Bem-vindo de volta" lead="…"><LoginForm … /></AuthFrame>` */
export function AuthFrame({
  pageTitle,
  heading,
  lead,
  children,
  footer,
  legalLinks = true,
}: AuthFrameProps): React.JSX.Element {
  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <title>{pageTitle}</title>
      <HeroPanel />
      <main className="flex min-w-0 flex-1 flex-col items-center px-4 py-10 sm:px-8 lg:max-w-[560px]">
        <div className="my-auto flex w-full max-w-[380px] flex-col gap-7">
          <BrandMark variant="compact" className="lg:hidden" />
          <header className="flex flex-col gap-2.5">
            <Ornament />
            <h1 className="font-display text-[40px] leading-[1.1] font-semibold">{heading}</h1>
            {lead && <p className="text-[15px] text-muted-foreground">{lead}</p>}
          </header>
          {children}
        </div>
        {(legalLinks || footer) && (
          <footer className="mt-10 flex w-full max-w-[380px] flex-col items-center gap-3">
            {legalLinks && <LegalLinks />}
            {footer}
          </footer>
        )}
      </main>
    </div>
  );
}

function HeroPanel(): React.JSX.Element {
  return (
    <section className="relative hidden min-w-0 flex-1 flex-col justify-between overflow-hidden border-r border-border bg-panel px-14 py-12 lg:flex">
      <LoginHeroArt className="absolute inset-0 size-full" />
      <BrandMark className="relative" />
      <div className="relative flex max-w-[520px] flex-col gap-5">
        <div className="flex items-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
          <span aria-hidden="true" className="h-px w-7 bg-current" />
          <span>Grid dinâmico</span>
        </div>
        {/* Display text, not a heading: the page h1 is the form title, which also exists on mobile. */}
        <p className="font-display text-[68px] leading-[1.02] font-medium tracking-[-0.01em]">
          Puxa uma cadeira.
          <br />
          <em className="text-primary">A mesa tá montada.</em>
        </p>
        <p className="max-w-[420px] text-[17px] leading-relaxed text-muted-foreground">
          O mapa está aberto. Pode rolar iniciativa.
        </p>
      </div>
    </section>
  );
}

function Ornament(): React.JSX.Element {
  return (
    <div aria-hidden="true" className="flex items-center gap-2.5 text-primary">
      <span className="h-px w-[22px] bg-current opacity-60" />
      <span className="size-[7px] rotate-45 border border-current" />
      <span className="h-px w-[22px] bg-current opacity-60" />
    </div>
  );
}
