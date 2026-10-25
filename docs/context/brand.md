# Brand

`packages/brand` (`@lorkarium/brand`): a marca do Lorkarium num pacote só de arquivos, sem código. Hoje só a landing ([`site.md`](site.md)) usa; o client (`client/src/index.css`) e a splash do desktop (`desktop/src/splash.css`) ainda têm a cópia deles — migrar os dois é tarefa separada.

| Export                           | O que é                                                                                                                                                                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lorkarium/brand/tokens.css`    | a paleta crua em `:root` (`--brand-gold`, `--brand-gold-hover`, `--brand-ink`, `--brand-parchment`, `--brand-muted`, `--brand-border`, `--brand-panel`, …) e as três famílias (`--brand-font-sans`, `--brand-font-display`, `--brand-font-wordmark`) |
| `@lorkarium/brand/fonts.css`     | as fontes self-host pelo `@fontsource-variable/*` (Hanken Grotesk, Cormorant Garamond com itálico, Cinzel): nenhuma chamada ao Google                                                                                                                |
| `@lorkarium/brand/logo-mark.svg` | os três cristais em contorno, `stroke="currentColor"`                                                                                                                                                                                                |
| `@lorkarium/brand/favicon.svg`   | o ícone com o disco escuro (o mesmo de `client/public/favicon.svg`, de onde saem os ícones do desktop)                                                                                                                                               |

- Sem semântica de componente: cada consumidor mapeia a paleta para os papéis dele (o `@theme` do site; no client seriam os tokens do shadcn).
- Cor nova da marca entra aqui; cor que só um consumidor usa fica no consumidor. O spec `site/test/styles/brand-tokens.spec.ts` recusa `var(--brand-*)` que o `tokens.css` não declara.
