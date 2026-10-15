# Design system do client

Identidade visual do Lorkarium, em tokens de `client/src/index.css` (variável CSS no `:root`, exposta ao Tailwind pelo `@theme inline`). Referência visual: `docs/pages/login/Main.dc.html`. Tema único, escuro (`color-scheme: dark`).

## Cores (classe Tailwind → valor)

| Papel                            | Classe                                    | Valor     |
| -------------------------------- | ----------------------------------------- | --------- |
| Painel mais fundo (ilustração)   | `bg-panel`                                | `#0C0E11` |
| Fundo da página                  | `bg-background`                           | `#101216` |
| Superfície elevada, campo        | `bg-card`                                 | `#15181D` |
| Superfície interativa            | `bg-muted` / `bg-secondary` / `bg-accent` | `#1B1F25` |
| Texto principal                  | `text-foreground`                         | `#EAE5DA` |
| Rótulo de campo                  | `text-label`                              | `#D5D0C4` |
| Texto secundário                 | `text-muted-foreground`                   | `#A9A497` |
| Placeholder (~5,5:1)             | `placeholder:text-placeholder`            | `#8A8F99` |
| Acento, foco                     | `bg-primary` / `ring` / `outline-ring`    | `#C5A46D` |
| Acento em hover                  | `hover:bg-primary-hover`                  | `#D4B57E` |
| Texto sobre o acento             | `text-primary-foreground`                 | `#15130F` |
| Borda de campo                   | `border-input`                            | `#303640` |
| Borda de seção                   | `border-border`                           | `#23272E` |
| Divisor fino                     | `bg-divider`                              | `#262B33` |
| Erro: borda e decoração (~4,4:1) | `border-destructive`                      | `#B5654F` |
| Erro: **texto** (~6:1)           | `text-destructive-text`                   | `#D0806A` |

## Tipografia

- `font-sans`: Hanken Grotesk (corpo, formulário, botão).
- `font-display` (= `font-heading`): Cormorant Garamond, só títulos e manchete (itálico disponível).
- `font-brand`: Cinzel, só o wordmark `LORKARIUM` (`tracking-[0.32em]`).
- Fontes self-host por `@fontsource-variable/*` (sem chamada ao Google).

## Forma e foco

- `--radius` 0.5rem (8px): campo e botão em `rounded-lg`.
- Foco de botão e checkbox: `outline-2 outline-offset-2 outline-ring` (anel dourado afastado). Campo de texto: `border-primary` + `ring-3 ring-ring/20`.
- `Input`: 48px (`h-12`), `bg-card`, texto 15px. `Button` `size="xl"`: 50px, 15px semibold; `variant="default"` dourado; `variant="outline"` é o botão secundário (borda `input`, texto `label`, hover dourado).
- `Checkbox`: 18px, marcado em dourado. `Alert variant="destructive"`: fundo `destructive/10`, borda `destructive/60`, texto `destructive-text`.
- O autofill do Chrome é neutralizado no `index.css` (fundo `card`, texto `foreground`).

## Regras anti-template

- Sem gradiente decorativo, sem glassmorphism, sem sombra grande: elevação é superfície mais clara.
- Um acento só (o dourado), usado com parcimônia: ação primária, foco, detalhe de ornamento.
- Serifa só em display e marca; corpo sempre na grotesca.
- Ilustração do próprio domínio (grid, tokens, barra de vida, rosa dos ventos), nunca herói genérico nem emoji como ícone; ícones de interface são `lucide-react`.
- Erro nunca só por cor: texto ligado ao campo (`aria-describedby`) e `aria-invalid`.
