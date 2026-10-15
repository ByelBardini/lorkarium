# Client · shell, home e mesa

A tela que a pessoa vê ao logar e a moldura que as telas logadas herdam. Plano de origem: `docs/plans/2026-10-14-tela-home.md`; mockup: `docs/pages/home/Home.dc.html` (base, não lei). Server e contrato em [`../campaigns.md`](../campaigns.md).

## Shell (`src/app/shell/`)

- `app-shell.tsx` — `AppShell({ railStore, user, onSignOut })`: trilho no desktop (`md+`), barra superior com gaveta abaixo de `md`, rota no `main`. Linha de progresso (`h-0.5` dourada, `aria-hidden`) no topo enquanto `useNavigation()` não está `idle`; a primeira carga é do splash.
- `app-rail.tsx` — `AppRail` (`aside` "Menu lateral", `bg-panel`, `w-14` ↔ `w-56`, transição curta com `motion-reduce:transition-none`): `RailBrand` (só o cristal recolhido, cristal + LORKARIUM expandido), `RailNav` (`nav` "Principal"; hoje só "Mesas", `NavLink end`; ativo = traço dourado à esquerda, não caixa; recolhido, o nome fica em `sr-only` e num tooltip à direita) e o botão "Recolher menu" ↔ "Expandir menu" (`aria-expanded`). O grupo de acesso rápido às mesas ativas fica para depois.
- `user-menu.tsx` — `UserMenu` (dropdown no rodapé do trilho): e-mail, "Backoffice" (só `admin`) e "Sair". Minha conta/Configurações ficam escondidas até existirem.
- `mobile-rail.tsx` — `MobileRail`: "Abrir menu" abre o trilho expandido numa `Sheet` à esquerda; escolher um link fecha.
- `api-loader.ts` — `valueOrThrow(resultado, request, sessionStore)`: valor, ou `redirect` para o login com `next` (`unauthenticated`, depois de `signedOut()`), ou `ApiLoadError(kind)` para o `ErrorBoundary`; `redirectIfSignedOut(falha, request, sessionStore)` para as `action`.

## Home (`src/features/home/`)

- `home-route.tsx` — `homeRoutes(deps)`: rota `home` (`path: '/'`, `loader` = `campaignsApi.list()`, `action` = `homeAction`, `ErrorBoundary` = `HomeErrorScreen`) com o índice vazio e a rota do detalhe por filha. Sorteia a saudação e fixa o `now` **uma vez por visita** (`useState(deps.random)`).
- `home-page.tsx` — `HomePage({ user, campaigns, now, greetingDraw, clipboard })`: cabeçalho (`GreetingHeader` + `HomeActions` quando há mesa), `ContinueBand` (se `continueCandidate`), `CampaignList`, `HomeDialogs` e o `Outlet` do modal.
- `greeting-header.tsx` — sobrelinha da data (`formatOverlineDate`) e `h1` com `greetingFor`. As 10 saudações moram em `src/lib/greeting.ts`.
- `continue-band.tsx` — região "Continuar": capa grande, nome, meta, "Entrar na mesa" e "Detalhes". Faixa entre fios, sem card.
- `campaign-list.tsx` — "Suas mesas" + contagem ("1 mesa"/"N mesas", do que está visível) + busca (`searchbox` "Buscar mesa", estado local que sobrevive ao abrir/fechar o modal). Sem nenhuma mesa: convite com "Entrar com código" e "Nova mesa". Busca vazia: "Nenhuma mesa com “termo”. Confere o nome ou entra com um código."
- `campaign-row.tsx` — uma linha por mesa (link para `/campaigns/:id`): miniatura 64px, nome em display, meta, descrição numa linha a partir de `md`, papel ("Mestre"/"Jogador"). Separada por fio; hover sem fundo: nome dourado, capa acende, seta à direita.
- `home-error-screen.tsx` — offline: "Sem conexão" + mensagem; resto: "Não deu para carregar suas mesas."; "Tentar de novo" chama `useRevalidator().revalidate()`. O shell continua em volta.
- `home-action.ts` — `homeAction(deps)`: corpo JSON `{ intent: 'create' | 'join', input }` revalidado pelo DTO; devolve `{ created }`, `{ joined }` ou `{ failure }`; `unauthenticated` vai ao login.
- `home-dialogs.tsx` — monta só o diálogo aberto (cada abertura começa limpa). Entrar por código fecha o diálogo e navega para `/campaigns/:id`.
- `create-campaign-dialog.tsx` + `create-campaign-form.tsx` + `create-campaign-messages.ts` + `visibility-field.tsx` — "Nova mesa": nome, sistema, status, descrição, visibilidade (Privada marcada) e senha opcional; valida pelo `createCampaignRequestDto` (foco no primeiro inválido, por id); envio com "Criando…", botão desabilitado e `aria-busy`; recusa em `Alert`; sucesso troca para "Mesa criada" com o código em Cinzel e "Copiar código".
- `join-campaign-dialog.tsx` + `join-campaign-form.tsx` — "Entrar numa mesa": código em Cinzel com a máscara `XXXX-XXXX` ao digitar (`maskCampaignCode`; sem `maxLength`, para colar com espaços funcionar) e marcado para gerenciadores de senha ignorarem; senha só depois de `password_required` (aparece focada, código mantido); `password_invalid` limpa e refoca a senha (o campo remonta por `key`); `not_found` sob o código; `rate_limited`/`offline`/`unexpected` em `Alert`.

## Mesa (`src/features/campaigns/`)

- `campaign-routes.tsx` — `campaignDetailRoute(deps)` (filha da home, `campaigns/:campaignId`: `loader` do detalhe, `action` = `enter` + `redirect` para `/table`, ou `{ failure }`) e `campaignTableRoute(deps)` (filha do shell, `campaigns/:campaignId/table`).
- `campaign-detail-dialog.tsx` — `CampaignDetailDialog`: "Você mestra"/"Você joga", nome (título), meta, visibilidade ("Privada · com senha"), descrição, código + "Copiar código" (só mestre), "Participantes (N)" com o mestre primeiro e lugar reservado para o indicador de online (o online por enquanto só aparece na tela da mesa), "Fechar" e "Entrar na mesa". Fechar/Esc navega para `/`. `CampaignDetailErrorRoute`: "Mesa não encontrada" dentro do diálogo.
- `enter-campaign-button.tsx` — "Entrar na mesa" por `useFetcher` (POST em `/campaigns/:id`), "Entrando…" enquanto vai; falha fica num `role="alert"` ao lado. Usado no modal e na faixa "Continuar".
- `campaign-table-page.tsx` — `CampaignTablePage({ campaign, tableSessionApi, sessionStore })`: "O tabuleiro abre aqui." ao centro e o painel "Na mesa" à direita em `lg+` (abaixo em telas menores), "Voltar para as mesas", `<title>Lorkarium · {nome}</title>`; `CampaignTableErrorPage` ("Mesa não encontrada."). A rota (`tableRoute` em `campaign-routes.tsx`) monta a página com `key={campaign.id}`: outra mesa é outra visita.
- `features/sessions/use-table-session.ts` — `useTableSession(campaignId, api, sessionStore)`: cria a store de presença **uma vez por visita**, `open` no efeito e `close` na limpeza (sair da página sai da mesa); `unauthenticated` → `signedOut()` + `/login?next=<a mesa>` (com `replace`).
- `features/sessions/session-presence-panel.tsx` — `SessionPresencePanel({ store })`: região "Na mesa" com o estado da conexão em `role="status"` ("Conectando à mesa…" até o snapshot, "Ao vivo", "Reconectando…"), "N de M online" e uma linha por participante na ordem do server (mestre primeiro): ponto `size-2` dourado (online) ou apagado (offline), `aria-hidden`, nome, papel ("Mestre"/"Jogador") e "online"/"offline" em texto. Falha em `role="alert"` pelo `failureMessage` (`not_found` → "Essa mesa não existe ou você não participa dela."). Sem animação.
- `campaign-messages.ts` — `failureMessage(kind)` e as mensagens de offline, inesperado e "Essa mesa não existe ou você não participa dela.".

## Mensagens

- Campo: "Informe o nome da mesa.", "O nome pode ter no máximo 80 caracteres.", "Use no máximo 40 caracteres.", "A descrição pode ter no máximo 500 caracteres.", "A senha precisa de pelo menos 4 caracteres.", "Informe o código da mesa.", "O código tem 8 letras e números, como VHRN-7K2Q.", "Nenhuma mesa com esse código.", "Essa mesa pede senha.", "Senha incorreta.", "Informe a senha da mesa."
- Recusa: "Confira os campos e tente de novo.", "Muitas tentativas. Tente de novo em N s.", "Sem conexão com o servidor. Confira sua internet e tente de novo.", "Algo deu errado do nosso lado. Tente de novo em instantes."

## Testes

- `client/test/app/shell/` (shell, menu, gaveta, `api-loader`), `client/test/features/home/` (linha, lista, página, rota, os dois diálogos) e `client/test/features/campaigns/` (modal de detalhe e tela da mesa — o painel "Na mesa" e o `useTableSession` são provados aqui, pelo router inteiro com o `TableSessionApiFake`), com `testDependencies()`.
- E2E: `e2e/test/home.spec.ts` (ver [`../ci.md`](../ci.md)).
