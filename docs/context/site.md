# Site (landing)

A landing comercial do Lorkarium: um site estático em `site/` (`@lorkarium/site`) que apresenta o produto e leva a uma ação, **baixar o instalador para Windows**. Não fala com o server do app: sem sessão, sem Socket.IO. O app web segue no domínio `mesa.`; a landing fica no domínio raiz. Plano de origem: `docs/plans/2026-10-25-tela-landing-download.md`. Deploy: [`deploy.md`](deploy.md) (Landing); CI: [`ci.md`](ci.md).

## Stack e comandos

- Astro 7 estático (`output` padrão), Tailwind v4 pelo `@tailwindcss/vite`, Zod 4 só para a resposta do GitHub. O projeto usa **Node ≥ 26.13.0** (`engines` da raiz e `.nvmrc`).
- Marca de [`brand.md`](brand.md): `global.css` importa `@lorkarium/brand/fonts.css` e `tokens.css` e mapeia no `@theme` os papéis do site (`page`, `band`, `surface`, `surface-deep`, `line`, `edge`, `edge-strong`, `gold*`, `ink`, `parchment`, `label`, `muted`, `faint`, `ember*`; fontes `font-sans`, `font-display`, `font-wordmark`). Utilitário `site-wrap`: a coluna de até 1680 px com gutter `clamp(20px, 4vw, 64px)` (o 1200 px do mockup deixava muito vazio dos lados).
- Visual alinhado ao app (`client/design-system.md`): raio de 4 px (`rounded-sm`), sem sombra; seções separadas por divisórias finas (`border-edge`) em grade, nunca cards arredondados soltos. Botão secundário em `secondary-link.astro`.
- `pnpm site:dev` (4321) · `pnpm site:build` (`site/dist/`) · `pnpm --filter @lorkarium/site preview` · `pnpm --filter @lorkarium/site typecheck` (`astro check`) · `pnpm test:e2e:site`.
- Alias `@/*` → `site/src/*` (tsconfig + `vite.resolve.alias`).
- `security.csp` ligado: o Astro põe um `<meta http-equiv="content-security-policy">` com hash dos scripts e estilos e as diretivas do `astro.config.mjs` (`connect-src 'self' https://api.github.com`, `img-src 'self' data:`, `font-src 'self' data:`, porque o Vite embute os menores subsets das fontes como `data:`). Por isso **nada de atributo `style=`** nem script/estilo externo: tudo em classe Tailwind. O CSP não vale no `astro dev`, só em `build`/`preview`.

## Variáveis de build

| Variável               | Lida por                                     | Uso                                                 |
| ---------------------- | -------------------------------------------- | --------------------------------------------------- |
| `SITE_URL`             | `process.env` no `astro.config.mjs` (`site`) | canonical, Open Graph, sitemap; padrão `localhost`  |
| `PUBLIC_APP_URL`       | `astro:env/client` (obrigatória, URL)        | "Já tenho conta", "jogue pelo navegador"            |
| `PUBLIC_CONTACT_EMAIL` | `astro:env/client` (obrigatória)             | "Pedir convite" (`inviteMailto`), FAQ, rodapé       |
| `LEGAL_DRAFTS_ALLOWED` | `astro:env/server` (padrão `false`)          | só com `true` Termos/Privacidade em rascunho passam |

`site/.env.example` tem os valores de dev; o `site/.env` é ignorado pelo git. O `astro:env` embute os valores no build: trocar exige rebuild.

## Páginas e seções

- `src/layouts/site-layout.astro` — `<head>` (título, descrição, canonical, Open Graph, `twitter:card`, JSON-LD `SoftwareApplication` com `offers.price "0"`/BRL, `noindex` opcional), link "Pular para o conteúdo", `SiteHeader`, `<main id="conteudo">`, `SiteFooter`.
- `src/pages/index.astro` — na ordem: `hero` (`#topo`), `audience-strip`, `feature-grid` (`#recursos`), `combat-showcase` (`#combate`), `how-it-works` (`#como`), `download-panel` (`#baixar`), `faq-list` (`#perguntas`). O `<script>` da página liga o `enhanceDownloadCtas`.
- `src/pages/obrigado.astro` — `noindex` e fora do sitemap: passo a passo (instalador, SmartScreen, convite), link manual, aviso de fallback, "Pedir convite" e o navegador. O `<script>` liga o `startDesktopDownload`.
- `src/pages/{termos,privacidade,404}.astro` — ver Páginas legais.
- Componentes de apoio: `section-heading` (kicker + título + parágrafo), `download-cta` (`<a href="/obrigado/" data-download-cta>`, `size: 'large' | 'small'`), `release-meta` (linha "Windows 10 ou 11 · 64 bits" + versão/tamanho ocultos), `platform-note` (avisos ocultos por plataforma), `product-shot` (moldura de janela + `<Picture>` AVIF/WebP), `hero-backdrop`.
- **Texto:** todo em `src/copy/landing-copy.ts` (`landingCopy.features`, `audience`, `combatPoints`, `steps`, `requirements`, `faqs`; `inviteMailto(email)`). Cada promessa corresponde a um recurso que existe (tabela "Texto revisado" do plano): sem dados (fora do MVP), "até 8 barras" (`MAX_BARS_PER_TOKEN`), dano/cura na barra. Mudou um recurso do app → revise este arquivo.

## Download

Cada push na `main` que mexe em `desktop/**` publica uma release nova ([`desktop.md`](desktop.md), Lançar uma versão), e a landing a oferece sem rebuild, porque lê a `latest` no navegador. Sem JS tudo funciona: os botões levam a `/obrigado/`, cujo link manual aponta para `RELEASES_PAGE_URL` (a página da última release). Com JS:

- `src/lib/desktop-release.ts` — `desktopReleaseOf(body)` lê a resposta de `GET api.github.com/repos/ByelBardini/lorkarium/releases/latest` (Zod) e devolve `DesktopRelease { version, sizeBytes, url, publishedAt }` ou `null`, nunca lança. O instalador é o asset `/^Lorkarium_(\d+\.\d+\.\d+)_x64-setup\.exe$/` (`.sig` e `latest.json` ignorados); com vários, vence o que casa com a tag `desktop-v<versão>`. Tamanho inteiro positivo e URL `https` com host exatamente `github.com`.
- `src/lib/file-size.ts` — `fileSizeLabel(bytes)`: base 1024 como o Explorer, KB arredondado para cima até 999 KB, depois MB com uma casa ("8,4 MB").
- `src/lib/visitor-platform.ts` — `visitorPlatformOf({ userAgent, maxTouchPoints })`: mobile primeiro (Android diz "Linux", iOS diz "Mac OS X"; Mac com toque > 1 é iPad), depois windows, mac, linux; resto `unknown` (tratado como Windows).
- `src/services/release-source.ts` — `GithubReleaseSource({ http, cache, now, maxAgeMs = 10 min, timeoutMs = 5 s })`: guarda `{ savedAt, release }` no `sessionStorage` (`lorkarium:desktop-release`). Só grava release válida; status ≠ 200, corpo inválido, prazo ou storage bloqueado → `null` ou segue sem cache, sem lançar. Portas finas: `http-get.ts` (`FetchHttpGet`, `AbortController`), `session-cache.ts` (`BrowserSessionCache`), `page-navigator.ts` (`WindowNavigator`), `link-clipboard.ts` (`NavigatorLinkClipboard`). `src/scripts/browser-release-source.ts` monta a fonte real.
- **Por que a API e não o `latest.json`** do updater: a API tem CORS e traz o tamanho; o `latest.json` não traz o tamanho. O limite de 60 pedidos/h por IP sem token é o motivo do cache por aba.
- `src/scripts/download-cta.ts` — `enhanceDownloadCtas(document, { source, platform, clipboard, pageUrl })`: mostra o aviso da plataforma (`mac`/`linux` → `desktop-browser` com o link `${PUBLIC_APP_URL}/login`; `mobile` → "é pra computador" + "Copiar link"), liga o "Copiar link" e, com release, preenche e mostra todo `[data-release-meta]`. Sem release, nada muda.
- `src/scripts/thank-you.ts` — `startDesktopDownload(document, { source, navigator })`: com release, troca o link manual pelo `.exe`, escreve "Lorkarium 0.3.1 · 8,4 MB" e navega para o `.exe` uma vez (o download começa e a página fica); sem release, mostra o `[data-download-fallback]`.

## Páginas legais

- Coleção `legal` (`src/content.config.ts`, schema estrito `{ title, updatedAt, draft }`) em `src/content/legal/{termos,privacidade}.md`: "Termos de uso" e "Política de privacidade" (LGPD, Marco Civil, CDC), redigidos em 2026-10-25 a pedido do responsável a partir do que o código faz. Controladora **Evolutiva Sistemas** (Orleans/SC), canal `privacidade@evolutivasistemas.com.br` (o mesmo do site da Evolutiva), só maiores de 18, grátis com planos pagos futuros (30 dias de aviso), foro de Orleans/SC com a ressalva do consumidor. Dúvidas e denúncias apontam para o "Contato" do rodapé (`PUBLIC_CONTACT_EMAIL`). Publicados (`draft: false`) em 2026-10-25, depois da revisão do responsável: saem indexáveis, no sitemap e com "Atualizado em". Uma revisão futura pode voltar a `draft: true` enquanto o texto não fecha.
- **A política descreve o código**: dados de `users`/`auth_sessions`/2FA/convites, cookies `lk_session`/`lk_2fa`, `localStorage`/`sessionStorage` do client, foto sem metadados, AWS nos EUA (`us-east-2`), GitHub (release e updater), prazos (sessão 12 h/30 dias, links 5 min a 7 dias, backups 30 dias, registros de acesso 6 meses). Mudou um desses (campo pessoal novo, provedor, prazo, cookie, rastreador) → revise `privacidade.md` e o `updatedAt`, como o `landing-copy.ts` para recursos.
- `src/components/legal-page.astro` faz `getEntry` → `assertPublishable(entrada, LEGAL_DRAFTS_ALLOWED)` (`src/lib/legal-doc.ts`) → `render`, dentro do utilitário `legal-prose` (`global.css`: devolve o visual de `h2`, `h3`, `ul`, `strong` e `code` que o preflight tira). Rascunho sem `LEGAL_DRAFTS_ALLOWED=true` derruba o build citando o arquivo e "draft: true"; rascunho permitido (dev, CI) sai com `noindex`. Para publicar: `draft: false`. Markdown sem tabela: no celular ela estoura a largura.
- **O app abre estas páginas** por `GET /api/legal/terms` e `/api/legal/privacy` (302 para o `SITE_PUBLIC_URL` do server) e grava no aceite do convite a versão `LEGAL_DOCUMENTS_VERSION` (`packages/contracts`). Mudou o texto → `updatedAt` e essa constante juntos (ver [`legal.md`](legal.md)).
- `404.astro` (`noindex`, "Voltar para o início") e `robots.txt` por endpoint (`src/pages/robots.txt.ts`, precisa do `site` para a linha `Sitemap:`; lança sem ele).
- SEO no layout: canonical e `og:url` = `new URL(Astro.url.pathname, Astro.site)`, `og:image` absoluto `/og.png` (1200×630 em `public/`, gerado uma vez pelo Chromium do Playwright com as fontes da marca: refazer só se a marca ou a manchete mudar). O JSON-LD é bloco de dados `is:inline` com `<` escapado: não executa, então o CSP de script não se aplica e o Astro não gera hash. Favicon por `@lorkarium/brand/favicon.svg?url` (vira `data:`). A página não abre `<main>`: o layout já traz header, `<main id="conteudo">` e footer.

## Testes

- Vitest, projeto `@lorkarium/site` (`site/vitest.config.ts` com `getViteConfig` e `root` no `site/`, registrado nos `projects` da raiz). O config copia os valores de teste para o `process.env` antes do Astro: o `astro:env` embute no transform, onde o `test.env` não chega, e um `site/.env` local venceria.
- `globalSetup` `test/support/sync-content.ts`: roda o `astro sync` num processo filho com `cacheDir: .astro/` (o Container API só lê um store já sincronizado; sob o Vitest o `import 'astro'` chega vazio). `site/.astro/` é ignorado pelo git.
- `test/support/render-astro.ts` — `renderAstro(Componente, { props, slots, path })` → `Document` (Container API + JSDOM) e `renderAstroHtml`. Componente `.astro` **não** renderiza no ambiente `jsdom` do Vitest (`NoMatchingRenderer`): os specs dos scripts rodam no ambiente Node e montam o DOM com `new JSDOM(html)`.
- Fakes nomeados em `test/support/`: `HttpGetFake`, `SessionCacheFake`, `FetchFake`, `ReleaseSourceFake` (`hold()`/`answer()` para o estado "carregando"; `RELEASE_0_3_1`), `PageNavigatorFake`, `LinkClipboardFake` (`refuse()`), `github-release.ts` (respostas da API).
- Guardas: `test/styles/brand-tokens.spec.ts` (toda `var(--brand-*)` do site existe no `@lorkarium/brand`), `test/pages/index.spec.ts` (ordem das seções, todo `href="#x"` tem `id="x"`, toda `<img>` com `alt`/`width`/`height`), `test/copy/landing-copy.spec.ts` (o teto de 8 barras no texto).
- E2E em `e2e/test/site/download.spec.ts` pela config própria (ver [`ci/e2e.md`](ci/e2e.md)).

## Capturas

`src/assets/screens/hero.png` (2880×1800, a sala inteira) e `tracker.png` (1000×1250, o painel de combate) são capturas reais do app a 1440×900 em escala 2; o `product-shot` serve AVIF/WebP pelo `<Picture>`. Refazer quando a interface mudar (os scripts de 2026-10-25 não foram versionados):

1. Ambiente isolado, sem tocar no `pnpm dev`: banco `lorkarium_showcase` no Postgres de dev (`CREATE DATABASE`, `db:migrate` e `db:seed-dev` com esse `DATABASE_URL`; para recomeçar, `TRUNCATE campaigns CASCADE`), server na 3334 (`PORT=3334 SMTP_URL= S3_BUCKET=lorkarium-showcase APP_PUBLIC_URL=http://localhost:5174`) e client por `client/vite.e2e-tmp.config.ts` (5174).
2. Mesa da Bia "Os Sinos de Vharn" (D&D 5e), Caio entra pelo código e vira jogador; fundo de estrada na floresta 1920×1152 (20 × 12 casas), salvo só depois do "Imagem escolhida".
3. Tokens: Kael, Lyra e Thoren (aliados do Caio), Ogro das Cinzas (2×2) e Bandido 1–6; PV variados pelo "Editar PV de X".
4. Iniciativa: Lyra 19, Bandido 15 (Juntos), Kael 14, Ogro 11, Thoren 8; "Próximo turno" até a rodada 3; Envenenado 2 no Ogro, Concentrando sem limite na Lyra, Abençoado 8 em Kael e Thoren; a vez no Ogro.
5. Captura: "Enquadrar cena", zoom 78% (Ctrl+roda) e arraste com o botão direito para a área livre à esquerda do painel; o `clip` do Playwright sai com uma mancha branca sobre o WebGL, então o tracker é recortado da tela inteira pelo `sharp`.

## Armadilhas

- `@astrojs/astro2tsx` 0.1.3 (do `astro check`) carrega o `@napi-rs/wasm-runtime` sem declarar o `@emnapi/runtime`: o `packageExtensions` do `pnpm-workspace.yaml` o acrescenta. Sem ele o `astro check` pede para "instalar o `@astrojs/check`" mesmo instalado.
- Nenhuma outra release do repositório pode ser a "latest" (vale para o updater do desktop e para a landing): a API passaria a responder com ela e o download cairia no fallback.
