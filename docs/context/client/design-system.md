# Design system do client

Identidade visual do Lorkarium, em tokens de `client/src/index.css` (variável CSS no `:root`, exposta ao Tailwind pelo `@theme inline`). Referência visual: `docs/pages/login/Main.dc.html` e `docs/pages/home/Home.dc.html`. Tema único, escuro (`color-scheme: dark`).

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
| Barra abaixo de zero             | `bg-bar-negative`                         | `#D6455D` |
| Barra acima do máximo            | `bg-bar-over`                             | `#EAE5DA` |

### Status da mesa (`statusToneClass`, só tokens existentes)

| Status        | Classe                  | Por quê                           |
| ------------- | ----------------------- | --------------------------------- |
| Em construção | `text-chart-2` (aço)    | preparo, neutro frio              |
| Recrutando    | `text-chart-4` (musgo)  | aberta, "pode entrar"             |
| Em andamento  | `text-primary` (ouro)   | o estado vivo leva o acento único |
| Finalizada    | `text-muted-foreground` | encerrada, recua                  |

O `StatusBadge` pinta ponto (`bg-current`) e rótulo na mesma cor; o rótulo sempre diz o status.

## Tipografia

- `font-sans`: Hanken Grotesk (corpo, formulário, botão).
- `font-display` (= `font-heading`): Cormorant Garamond, só títulos e manchete (itálico disponível).
- `font-brand`: Cinzel, só o wordmark `LORKARIUM` (`tracking-[0.32em]`).
- Fontes self-host por `@fontsource-variable/*` (sem chamada ao Google).

## Forma e foco

- `--radius` **0.25rem (4px)**, uma escala só no produto: botão, campo, diálogo, menu e tooltip em `rounded-lg`/`rounded-md` (4px ou menos). Superfícies (lista, faixa, miniatura, capa) são **retas**. Nenhum `rounded-full`, exceto o rádio (o círculo é o que diz "escolha uma") e as duas exceções da conta (plano `2026-10-24-tela-perfil-e-conta.md`): a **foto ou as iniciais da pessoa** (`UserAvatar`, o círculo diz "pessoa") e as **8 cores da pessoa** como rádio na tela da conta.
- Foco de botão e checkbox: `outline-2 outline-offset-2 outline-ring` (anel dourado afastado). Campo de texto: `border-primary` + `ring-3 ring-ring/20`.
- `Input`: 48px (`h-12`), `bg-card`, texto 15px. `Button` `size="xl"`: 50px, 15px semibold; `variant="default"` dourado; `variant="outline"` é o botão secundário (borda `input`, texto `label`, hover dourado).
- `Checkbox`: 18px, marcado em dourado. `Switch` (`ui/switch.tsx`, sobre o `radix-ui`, escrito à mão sem o `shadcn add`): 42 × 24, trilho `input`, ligado em dourado com o botão escuro, sem sombra; a pílula é a forma que diz "liga/desliga" (exceção, como o rádio). `Alert variant="destructive"`: fundo `destructive/10`, borda `destructive/60`, texto `destructive-text`.
- O autofill do Chrome é neutralizado no `index.css` (fundo `card`, texto `foreground`).
- Cursor: o `@layer base` do `index.css` dá `cursor-pointer` a todo `button` e `[role=button]` habilitado e `cursor-not-allowed` ao `button:disabled` (o preflight do Tailwind v4 volta o botão para `default`). Não repetir `cursor-pointer` em botão.

## Regras anti-template

- Sem gradiente decorativo, sem glassmorphism, sem sombra: elevação é superfície mais clara. Os componentes shadcn instalados perdem `shadow-*` e `backdrop-blur`; o overlay de diálogo e gaveta é `bg-black/70`.
- Card só para item heterogêneo e acionável; itens iguais (mesas) são **lista** em linhas de largura total, separadas por fio (`border-divider`), sem caixa, sombra nem lift; o hover não pinta fundo (faixa de largura total parece solta): o nome fica dourado, a capa acende e surge a seta à direita. Blocos se agrupam por espaço, proximidade e tipografia ("structure should be felt, not seen").
- Nada de pílula: sem chip, badge ou contador arredondado; papel e status são texto (caixa alta espaçada, `tracking-[0.12em]`). Exceções combinadas, do exemplo do diálogo do token (`docs/pages/mesa/novo-token/`): o contador da aba "Barras" (badge redondo `bg-muted`) e o avatar de iniciais do jogador em "Quem controla" (círculo `bg-muted`); os botões de jogador continuam `rounded-md`.
- Cor de condição: o mestre escolhe uma de 12 da paleta fechada (`src/lib/condition-colors.ts`, todas ≥ 4,5:1 sobre `card`); ela pinta o ícone e a borda da etiqueta por estilo inline (Tailwind não monta classe dinâmica). O seletor é um rádio de bolinhas redondas (a exceção do rádio). Sem cor, valem os tokens do tom.
- Exceções do tracker de combate (`docs/pages/mesa/tracker/`): a **etiqueta de condição** (`condition-tag.tsx`) é uma caixa de 4px (`rounded-sm`, borda `primary/45` na benéfica, `destructive/60` na prejudicial e `destructive` cheia com fundo `destructive/15` na incapacitante) com ícone, nome e rodadas — a condição precisa ler de relance numa linha cheia; e a **linha da vez** no tracker ganha fundo `primary/10` junto do traço dourado de 2px à esquerda (a vez é o que a mesa inteira procura). O anel do avatar no painel (`TokenAvatar`) é um `box-shadow` de 2px na cor do lado, o mesmo anel do tabuleiro, não sombra de elevação.
- Exceção da prévia da mesa (`CampaignPreviewCard`, de `docs/pages/home/modal-nova-mesa/`): avisos de conteúdo e tags em etiquetas de 4px (`rounded-sm`): aviso com borda `destructive/60` e texto `destructive-text`, tag em `bg-muted` — o jogador precisa ler os avisos de relance antes de entrar; "Mestre" e o status ficam sobre a capa em faixas retas `bg-panel/85`.
- Exceção da aba "Na mesa" (`docs/pages/mesa/na-mesa/`): a pílula dourada com quantos estão online no `TabsTrigger` (`rounded-full bg-primary/15 text-primary`, `aria-hidden`). O símbolo de presença é uma bolinha (cheia, vazada, apagada) em selo no canto do retrato/avatar — o círculo, como o avatar, é "uma pessoa".
- Ponto de status só quando mapeia um estado definido, dito também em texto; nada de animação decorativa. O estado normal não se anuncia (a sala ao vivo não escreve "Ao vivo").
- Tela logada ocupa a largura toda ao lado do trilho, alinhada à esquerda (`w-full px-4 sm:px-8 lg:px-12`); nada de coluna centralizada com `mx-auto max-w-*`. Limite de largura só em parágrafo, pela leitura (`max-w-prose`).
- A moldura recua: o trilho é `bg-panel`, ícones de 16px, item ativo marcado por um traço dourado de 2px à esquerda (não caixa com borda).
- Um acento só (o dourado), usado com parcimônia: ação primária, foco, detalhe de ornamento.
- Serifa só em display e marca; corpo sempre na grotesca.
- Ilustração do próprio domínio (grid, tokens, barra de vida, rosa dos ventos), nunca herói genérico nem emoji como ícone; ícones de interface são `lucide-react`. As capas de mesa (`CampaignCover`) são SVG estático sobre grade dourada fraca, num dos 3 desenhos e num dos tons `chart-1..4` escolhidos pelo mestre (sem escolha, o desenho do id), ou a imagem que ele enviou (`object-cover`, decorativa).
- Erro nunca só por cor: texto ligado ao campo (`aria-describedby`) e `aria-invalid`.
