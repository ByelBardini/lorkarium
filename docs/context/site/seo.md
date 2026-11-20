# Site — SEO

Detalhe de [`../site.md`](../site.md). O objetivo: a landing aparecer para quem procura uma mesa virtual de RPG em português; o app (`app.`) fica fora do índice.

## `<head>` do layout

`src/layouts/site-layout.astro` é o único `<head>`. Props: `title`, `description`, `noindex?`, `ogImage?` (caminho do site, padrão `/og.png`; um valor que não começa por `/` ou começa por `//` lança citando o valor e "expected a site path like /og.png"), `ogImageAlt?` (padrão "Mapas e combate para o seu RPG"), `crumbs?` (a trilha → `BreadcrumbList`), `offers?` (ofertas além do Grátis) e `structuredData?` (nós só da página, como o `FAQPage`).

- **Ícones por URL estável**, nunca `data:`: o Google só mostra o ícone do resultado a partir de um arquivo rastreável, em múltiplo de 48 px. `public/favicon.svg` (cópia de `@lorkarium/brand/favicon.svg`: mudou a marca, copie de novo), `favicon-48.png`, `apple-touch-icon.png` (180, fundo opaco: o iOS aplica a máscara própria), `icon-192.png`/`icon-512.png` (do `site.webmanifest`; o 512 é o `logo` da Organization). Os PNG saem do SVG pelo `sharp` (`density` alta, `png({ palette: true })`).
- `theme-color` e o manifest com `#0a0b0e`, `lang pt-BR`, `display: browser` (a landing não é PWA).
- `og:image` absoluto + `og:image:alt`; `og:image:width/height` fixos em 1200×630 (toda `og-*.png` tem esse tamanho).
- **Preload da fonte do h1**: um `link rel=preload as=font` do `cinzel-latin-wght-normal.woff2`, importado por `?url` do `@fontsource-variable/cinzel` (dependência direta do site só para isso): o mesmo arquivo do `@font-face`, então o preload e a fonte têm a mesma URL com hash. Todo h1 é Cinzel; sem o preload o texto do LCP troca de fonte tarde.
- Comentários do `<head>` em `{/* */}`: `<!-- -->` iria para o HTML.

## Dados estruturados

`src/lib/structured-data.ts` monta um único `<script type="application/ld+json">` com `@graph` (escapando `<`; bloco de dados, fora do CSP de script):

- `siteGraphOf({ site, path, page, screenshot, crumbs?, offers?, extraNodes? })` → `Organization` (`@id` `<origin>/#organization`, `logo` `/icon-512.png`, `sameAs` o repositório), `WebSite` (`#website`, `inLanguage pt-BR`, `publisher`), `WebPage` (`<url>#webpage`, `isPartOf`, `breadcrumb` quando há trilha), `SoftwareApplication` (`#app`, `GameApplication`, "Windows 10, Windows 11, Web", `description`, `image` `/og.png`, `screenshot` = a captura `hero.png` processada pelo Astro, `featureList` = títulos de `landingCopy.features`, `offers` = Grátis `"0"` BRL + os extras), `BreadcrumbList` e os nós da página. `path` sem barra final lança ("expected a path ending in /").
- `faqGraphOf(faqs)` → `FAQPage` com o mesmo texto visível: a home passa `landingCopy.faqs`; `/planos/` passa `plansCopy.faqs`, a trilha e `planOffersOf(plansCopy)` (uma `Offer` por plano pago e período, `price` em reais com ponto, "142.90", dos mesmos `priceCents` da página). Os guias com `faqs` também.
- O Google encerrou o rich result de FAQ em 7/5/2026, mas o tipo `FAQPage` segue válido e ajuda a entender a página: marcado sem esperar a sanfona no resultado.
- **Nenhum `aggregateRating`/`review`**: as diretrizes exigem avaliações reais, e inventar dá ação manual. Só com avaliações coletadas de verdade (o spec cobra a ausência).
- Validar depois de mudança: [Rich Results Test](https://search.google.com/test/rich-results) e [Schema Markup Validator](https://validator.schema.org/) colando o HTML do `site:build`.

## Títulos, descrições e h1

- Title de 10 a 60 caracteres, começando ou terminando por "Lorkarium"; description de 70 a 160, com o termo ("mesa virtual de RPG") uma vez, natural; nenhum par de páginas igual.
- Exatamente um `h1` por página. Na home o `h1` abre com "Mesa virtual para RPG" num `span.eyebrow` (`font-sans leading-normal`, para não herdar o `.headline`) antes do slogan: o termo buscado no h1, o visual de sobretítulo igual.

## Sitemap

`astro.config.mjs` lê o frontmatter das coleções direto do disco (`getCollection` não existe ali) por `contentPageOf` e passa ao `@astrojs/sitemap`:

- `filter` = `isIndexablePath(path, hiddenPathsOf(páginas))`: fora `/obrigado/`, `/404/`, todo rascunho e o hub `/recursos/` sem guia publicado.
- `serialize` = `sitemapEntryOf`: `lastmod` só da data do frontmatter (`updatedAt` dos guias em `YYYY-MM-DD`, das legais em "19 de novembro de 2026"; `isoDateOf` lança em outro formato). Nunca a data do build: um `lastmod` que muda a cada build faz o Google ignorar o campo.
- `src/lib/sitemap-entry.ts` não importa nada (o config não tem o alias `@/`).

## Páginas de intenção (guias)

Coleção `guides` (`src/content/guides/recursos/*.md`), schema `guideSchema` em `src/lib/guide-schema.ts` (estrito): `kind` (só `recurso`; outro valor recusa citando-o), `name` (≤ 40, trilha e card), `title` (10–60), `description` (70–160), `h1`, `lead`, `updatedAt` (`YYYY-MM-DD`), `draft`, `order`, `related` (ids de outros guias), `faqs?`, `shot?` (uma captura de `src/assets/screens/`) e `shotAlt?`.

- Rota: `src/pages/recursos/[slug].astro` (rota em vez de página estática para que o rascunho não seja gerado). `guidePathsOf` (`src/lib/guides.ts`) gera um caminho por guia visível do tipo.
- **Rascunho**: `GUIDE_DRAFTS_ALLOWED` (`astro:env/server`, padrão `false`) como o `LEGAL_DRAFTS_ALLOWED`. Em produção o rascunho não gera rota, não entra no hub, nos links nem no sitemap; com `true` (dev, Vitest) sai com `noindex`. Só o usuário troca `draft` para `false`, depois de revisar o texto.
- `guide-entry.astro` resolve os relacionados (`relatedGuidesOf`, só entre os visíveis: um id inexistente derruba o build citando-o e a lista) e renderiza `guide-page.astro`: trilha visível `breadcrumb-trail.astro` (`nav[aria-label="Trilha"]`, a mesma do `BreadcrumbList`), `h1` + `lead`, captura com `priority` (`act-shot.astro`: `loading="eager"` + `fetchpriority="high"`, a imagem do LCP), corpo em `legal-prose` (que ganhou `ol`), `FaqList` + `FAQPage` quando há `faqs`, `related-guides.astro` ("Veja também") e `DownloadPanel`.
- Hub `src/pages/recursos/index.astro` por `guide-hub.astro`: um card por guia visível, na ordem de `order` (grade com borda por card: linha incompleta termina sem casa vazia); sem guia publicado, `noindex` (a mesma regra do `hiddenPathsOf`) e um aviso de "sendo escritas". Imagem de compartilhamento `og-recursos.png`, a mesma do guia.
- Header e rodapé: `guideNavLinksOf` põe "Recursos" quando o hub tem guia visível.
- Páginas de sistema (`/sistemas/`) e a comparação `/alternativas/` foram escritas e retiradas em 2026-11-20 a pedido do usuário: só voltam com pedido explícito.
- Acrescentar um guia: o `.md` com o frontmatter, `draft: true`; o id entra em `EXPECTED_GUIDES` de `test/content/guides-copy.spec.ts`; o `seo-guard` o pega sozinho.
- **Texto**: cada fato conferido no `docs/context/<área>.md`; ≥ 350 palavras, ≥ 2 links internos com barra final, sem imagem no corpo (a captura vem pelo `shot`), sem prometer mais que 8 barras.
- **Marcas**: nenhum guia cita outro VTT (o `guides-copy.spec.ts` cobra).

## Guarda de SEO

`test/pages/seo-guard.spec.ts` renderiza toda página publicada (`test/support/published-pages.ts`: as `.astro` estáticas fora `404`/`obrigado`, mais todo guia, rascunhos inclusive) e cobra as regras de `test/support/seo-rules.ts`: title, description, um `h1`, canonical = `SITE_URL + path`, nenhum `noindex` nas indexáveis (rascunho e hub vazio podem ter) e nenhum title/description repetido. Página nova entra sozinha. O e2e `e2e/test/site/seo-crawl.spec.ts` faz o mesmo no build real a partir do `sitemap-index.xml` (200, canonical a si mesma, um `h1`, sem `noindex`, `@graph` presente, todo link interno 200; `/obrigado/` e a 404 fora do sitemap e com `noindex`).

## Imagens de compartilhamento

`og.png` (a da landing) e `og-recursos.png` (1200×630): `pnpm --filter @lorkarium/site og:images` (`site/scripts/og-images.ts`, Playwright + `sharp`, devDependencies do site; fora do build e do CI) cobre a manchete do `og.png` com o degradê escuro e escreve a do hub em Cinzel. Refazer quando a manchete de um hub ou a marca mudar; ver [`capturas.md`](capturas.md).

## App fora do índice

O server responde tudo com `X-Robots-Tag: noindex, nofollow` (`server/src/app/search-noindex.ts`) e o `client/index.html` tem o `<meta name="robots">` (dev e casca desktop, onde o header não chega). O `client/public/robots.txt` **libera** o rastreio: um `Disallow` impediria o Google de ver o noindex e deixaria a URL indexada sem conteúdo. Ver [`../server.md`](../server.md).

## Desempenho

Pouco JS (scripts só na home e no `obrigado`), `<Picture>` AVIF/WebP com `widths`/`sizes`, `lazy` abaixo da dobra e `eager` + `fetchpriority=high` na captura do topo dos guias, cache imutável do `/_astro/`, fonte do h1 pré-carregada. A medição de Lighthouse (mobile) de antes e depois sobre o `preview` de `/`, `/planos/` e um guia ainda não foi anotada aqui: medir no DevTools e registrar a data e os números.

## Medição e lançamento (manual)

Sem analytics no site (mudaria a Privacidade e o CSP). A medição de busca é pelo Google Search Console e pelo Bing Webmaster, sem código:

1. Search Console: propriedade **de domínio** (TXT no DNS da Cloudflare; cobre raiz, `www` e `app.`).
2. Enviar `https://<domínio>/sitemap-index.xml`; inspecionar a home e pedir indexação.
3. Bing Webmaster: importar do Search Console.
4. Conferir que `www` → raiz e `http` → `https` respondem 301 (Coolify/Traefik).
5. Fora do código: `homepage` do repositório no GitHub apontando para a landing; cadastro em diretórios de VTT (AlternativeTo); links das comunidades.
6. Depois de 4 semanas: em "Desempenho" e "Páginas", ajustar title/description das páginas com muita impressão e CTR baixo.

Onde ficou o TXT e quem tem acesso vai em [`../deploy.md`](../deploy.md) (Landing) quando a verificação for feita.
