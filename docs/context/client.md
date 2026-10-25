# Client

SPA React 19 + Vite 8 em `client/` (alias `@/*` → `src/*`). Tela em `src/features/<área>/`, componente compartilhado em `src/components/`, rede em `src/services/`, estado em `src/stores/`, moldura do app em `src/app/shell/`, tabuleiro em `src/renderer/` (PixiJS, sem React; ver [`client/board-renderer.md`](client/board-renderer.md)).

> **Detalhe por assunto em [`client/`](client/) — abra só o arquivo da tarefa.** Este hub guarda a estrutura, as rotas e os testes.

| Assunto                                                                                     | Arquivo                                               |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Tokens de cor, tipografia, forma, componentes base e regras anti-template                   | [`design-system.md`](client/design-system.md)         |
| Shell (trilho, menu, gaveta), home, diálogos de mesa e detalhe                              | [`home.md`](client/home.md)                           |
| Peças da mesa: capa, status, avisos, tags, prévia, `update`/código/excluir, eventos ao vivo | [`campaign-parts.md`](client/campaign-parts.md)       |
| Página "Configurações da mesa" na sala: rota, moldura, ação, rascunho, seções, pendência    | [`campaign-settings.md`](client/campaign-settings.md) |
| Tempo real: transporte Socket.IO, sessão da mesa, mesas abertas da aba, presença e versão   | [`realtime.md`](client/realtime.md)                   |
| Sala de jogo: tabuleiro, renderer, câmera, ferramentas, sync e comandos                     | [`board.md`](client/board.md)                         |
| Renderer PixiJS: câmera, entrada, `BoardView`, hover, faixas, adaptador                     | [`board-renderer.md`](client/board-renderer.md)       |
| Tokens na sala: arraste, teclado, lista "Na cena", detalhe, diálogo e barras                | [`tokens.md`](client/tokens.md)                       |
| Diálogo do token: prévia (lugar da imagem), abas Básico, Barras, Visão e luz                | [`token-dialog.md`](client/token-dialog.md)           |
| Rodapé do token (`TokenDock`): selecionado ou principal, `mainTokenIdOf`, `token:setMain`   | [`token-dock.md`](client/token-dock.md)               |
| Aba "Na mesa": mestres, card de cada jogador (ficha, token principal, barras), ausência     | [`table-people.md`](client/table-people.md)           |
| Combate na sala: tracker, iniciativa, turnos, condições e a vez no tabuleiro                | [`combat.md`](client/combat.md)                       |
| Condições: etiquetas, descrição, stacks, página "Condições da mesa", ferramenta (C)         | [`conditions.md`](client/conditions.md)               |
| Desenhos na sala, copiar/colar (Ctrl+C/V) e desfazer/refazer (Ctrl+Z/Y)                     | [`drawings.md`](client/drawings.md)                   |
| Áreas de efeito na sala: estado, ferramenta (M), seleção, alças, copiar                     | [`effect-areas.md`](client/effect-areas.md)           |
| Paredes e portas na sala: estado, ferramenta (P), linhas, edição, portas                    | [`walls.md`](client/walls.md)                         |
| Visão: alcance do token, modo da cena, filtro, névoa, rota, prévia do mestre                | [`vision.md`](client/vision.md)                       |
| Luzes: estado, comandos, luz do token, ferramenta (L), ícones, acender                      | [`lights.md`](client/lights.md)                       |
| Cone: campo de visão, lanterna, holofote mirado, contorno do mestre                         | [`cones.md`](client/cones.md)                         |
| Desempenho: orçamento, regras que não podem ser desfeitas, cena de estresse, bench, painel  | [`performance.md`](client/performance.md)             |
| Biblioteca de grids: rota, modal, árvore de pastas e grids, menu, painel e arrastar         | [`library.md`](client/library.md)                     |
| Abas de grid na sala: escopo do comando, `watch`, `scene-tabs-store`, `SceneTabs`           | [`grid-tabs.md`](client/grid-tabs.md)                 |
| Personagem: elenco, token ligado composto, ligar à ficha, "Adicionar jogadores"             | [`characters.md`](client/characters.md)               |
| Ping no mapa: cor por pessoa, segurar/Alt+clique, pulso do anel, seta na borda              | [`pings.md`](client/pings.md)                         |
| Minha conta: perfil, foto, barra de alterações, senha, e-mail, sessões, 2FA, link do e-mail | [`account.md`](client/account.md)                     |
| Backoffice: moldura, Usuários, busca/filtros na URL, convidar, menus e diálogos das contas  | [`backoffice.md`](client/backoffice.md)               |
| Links de conta: `/invite` (escolher @ e senha) e `/reset-password`                          | [`account-links.md`](client/account-links.md)         |
| Menu dos campos de texto no app desktop: `isDesktopShell`, itens, `FieldEditing`, raiz      | [`text-field-menu.md`](client/text-field-menu.md)     |
| Armadilhas gerais do client (router, Radix, React Compiler, jsdom, Playwright)              | [`armadilhas.md`](client/armadilhas.md)               |

## Estrutura

- `src/main.tsx` — monta `createBrowserRouter(buildRoutes(deps))` com os adaptadores reais (`HttpAuthApi`, `HttpCampaignsApi`, `createOpenTablesStore` (com `tabInteractionFactory(boardCommands)`) sobre a `RealtimeTableSessionApi` (sobre `SocketIoRealtimeTransport` com `crypto.randomUUID`) e o `sessionStorage`, `NavigatorClipboard`, `isDesktopShell`, `DocumentFieldEditing`, `createRailStore` sobre o `localStorage`, `new Date()`, `Math.random`)
- `src/app/router.tsx` — `buildRoutes(deps)`: rotas do modo data do React Router 8 (abaixo); `AppDependencies` = `{ authApi, campaignsApi, profileApi, accountSecurityApi, userAdminApi, accountLinksApi, libraryApi, sceneActivation, assets, clipboard, isDesktop, fieldEditing, openTables, sessionStore, railStore, roomLayout, drawingStyle, effectAreaStyle, wallStyle, lightReach, lightColor, createBoardRenderer, boardCommands, interactionClock, now, random, waitBeforeRetry }`, para o teste injetar fakes
- `src/app/route-access.ts` — `decideAccess(session, access, url)`: decisão pura `allow` | `redirect` por `RouteAccess` (`public-only`, `signed-in`, `admin`, `anyone`); `loginPathFor(url)` → `/login?next=…`
- `src/app/splash-screen.tsx` (`role="status"`, "Carregando…" ou "Reconectando ao servidor…"), `src/app/boot-session.ts` ([`auth.md`](auth.md), Boot) e `src/app/route-error-screen.tsx`
- `src/app/shell/` — `AppShell`, trilho, menu do usuário, gaveta e `api-loader.ts` (ver [`client/home.md`](client/home.md))
- `src/features/auth/` — tela de login em duas etapas (ver [`auth.md`](auth.md)); `src/features/account/` — "Minha conta" (ver [`client/account.md`](client/account.md)); `src/features/home/`, `src/features/campaigns/` e `src/features/sessions/` (`useOpenTable` e `useSignOutWhenRefused`, ver [`client/home.md`](client/home.md); a aba "Na mesa" — card, linha do mestre, ausência —, ver [`client/table-people.md`](client/table-people.md)); `src/features/admin/` (backoffice) e `src/features/account-links/` (`/invite`, `/reset-password`): ver os sub-docs
- `index.html` + `public/favicon.svg` — favicon: o cristal da `BrandMark` em dourado num círculo `#0c0e11` (o `panel`), traço mais grosso para ler em 16px
- `src/assets/` — imagens importadas pelo Vite (`evolutiva-mark.png`)
- `src/index.css` — tokens do tema (único, escuro) e as fontes self-host (`@fontsource-variable`)
- `src/components/ui/` — componentes shadcn (`button`, `input`, `label`, `checkbox`, `alert`, `textarea`, `radio-group`, `dialog`, `alert-dialog` (confirmação destrutiva, `role="alertdialog"`; gerado pelo `shadcn add` com `--overwrite` e o `button.tsx` do projeto restaurado), `sheet`, `dropdown-menu`, `tooltip`, `context-menu`, `popover`, `tabs`, `switch` (escrito à mão sobre o `radix-ui`)), já ajustados ao design system
- `src/components/brand-mark.tsx` — `BrandMark` (logo; variantes `full`, `compact` e `icon`, só o cristal, sempre anunciado como "LORKARIUM")
- `src/components/image-picker.tsx` — `ImagePicker` (área de soltar/colar + botões), sobre `use-image-sender.ts` (`useImageSender`: envio de arquivo e link) e `image-source-buttons.tsx` (`ImageSourceButtons`, `ImageLinkField`, `ImageSendNotice`); detalhe em [`client/board.md`](client/board.md)
- `src/components/signed-out-redirect.tsx` — `SignedOutRedirect` (sessão caída fora do loader: `signedOut` + `/login?next=<caminho e query>`, `replace`), usado pelo diálogo da biblioteca e pelo `ErrorBoundary` de "Minha conta"
- `src/components/range-field.tsx` — `RangeField` (um lado de alcance na unidade da cena, com "= N casas" embaixo; `placeholder` e `onBlur` opcionais), usado pela visão e pela luz do token e pelo painel de luzes
- `src/components/segment-field.tsx` — `SegmentField` (escolha entre 2–3 segmentos lado a lado, `radiogroup` do Radix, `mark` e `disabled` por opção, `hint`; `fill` faz os segmentos dividirem a linha); o `choice-field.tsx` é a versão círculo + texto
- `src/components/form-field.tsx` — `FormField` (rótulo + controle + erro `<id>-error` ou dica); `password-field.tsx` — `PasswordField` (mostrar/ocultar, `autoComplete` e `autoFocus` opcionais)
- `src/components/{campaign-cover,cover-picker,status-badge,campaign-preview-card}.tsx` — capa gravada (imagem ou desenho × tom), escolha da capa, selo de status e prévia "como aparece no hub" ([`client/campaign-parts.md`](client/campaign-parts.md)); `copy-code-button.tsx` ("Copiar código", ou o `label` dado, + `role="status"`)
- `src/components/unsaved-changes-bar.tsx` — `UnsavedChangesBar` (barra de alterações com rótulo da região por prop: "Minha conta" e "Configurações da mesa"), com o estado por `src/lib/unsaved-changes.ts` (`unsavedChangesStateOf`, `useSavedNotice`)
- `src/components/load-error-screen.tsx` — `LoadErrorScreen({ pageTitle, failedHeading })`: `ErrorBoundary` de `loader` (home e conta)
- `src/components/user-avatar.tsx` — `UserAvatar`: foto ou iniciais na cor, em círculo (ver [`client/table-people.md`](client/table-people.md))
- `src/lib/utils.ts` — `cn`
- App desktop: `src/lib/desktop-shell.ts` (`isDesktopShell`), `src/services/field-editing.ts` e `src/features/text-field-menu/` — ver [`client/text-field-menu.md`](client/text-field-menu.md)
- `src/lib/stored-choice.ts` — `readStoredChoice(storage, chave, opções, padrão)` / `writeStoredChoice`: preferência de UI no `localStorage` que cai na memória se o storage lança (trilho e painel da sala)
- `src/lib/use-media-query.ts` — `useMediaQuery(query)` e `DESKTOP_QUERY` (`md`); sem `matchMedia` (jsdom) responde `true`
- `src/lib/board-shortcuts.ts`, `ruler-label.ts` — atalhos e régua da sala (ver [`client/board.md`](client/board.md))
- `src/lib/table-roster.ts`, `member-presence.ts`, `idle-watch.ts`, `away-label.ts` — seções, presença, inatividade e "ausente há N min" da aba "Na mesa" (ver [`client/table-people.md`](client/table-people.md))
- `src/lib/cells-text.ts` — `cellsText(1.5)` → `'1,5'`: casas com vírgula (detalhe, anúncio e formulário do token)
- `src/lib/token-side.ts` — `sideRingVar(lado)` → `var(--label)` / `var(--chart-3)` / `var(--chart-2)`: a cor do anel do token no DOM (a prévia do diálogo; o canvas tem os hex)
- `src/lib/safe-redirect.ts` — `safeRedirectTarget(next)`: só caminho interno; `//x`, `/\x`, URL absoluta, `javascript:`, vazio e `/login` viram `/`
- `src/lib/greeting.ts` — `GREETINGS` (as 10 saudações da home) e `greetingFor(nome, sorteio ∈ [0, 1))` com o primeiro nome; sorteio fora do intervalo → `RangeError`
- `src/lib/overline-date.ts` — `formatOverlineDate(data)` → "Quarta, 14 de outubro" (sem "-feira", hora local)
- `src/lib/{campaign-status,content-warnings,campaign-tags,campaign-cover}.ts` — rótulo e tom do status, avisos e sugestões de tag, `addTag`/`removeLastTag`, `fallbackCoverOf(id)` ([`client/campaign-parts.md`](client/campaign-parts.md))
- `src/lib/campaign-code.ts` — `formatCampaignCode('VHRN7K2Q')` → `'VHRN-7K2Q'` e `maskCampaignCode(digitado)` (máscara do campo: só letras e dígitos, caixa alta, até 8, hífen depois do 4º; quem valida continua sendo o DTO)
- `src/lib/search-text.ts` — `searchText('Ossuário')` → `'ossuario'`: o texto de busca sem acento nem caixa (mesas e biblioteca)
- `src/lib/folder-tree.ts` — árvore, árvore filtrada pela busca e `canDrop` da biblioteca; `edited-label.ts` — "editado há 3 dias" (ver [`client/library.md`](client/library.md))
- `src/lib/use-fragment-token.ts` — `useFragmentToken()`: o `token` de `#token=…` lido uma vez e o fragmento tirado da URL (`replace`); páginas de link de uso único
- `src/lib/use-draft-field.ts` — `useDraftField({ confirmed, normalize?, save })`: rascunho × confirmado (ficha, nome do grid)
- `src/lib/{member-since,since-label,two-factor-text,avatar-file,download-text}.ts` — de "Minha conta" ([`client/account.md`](client/account.md))
- `src/lib/campaign-list.ts` — `filterCampaigns(mesas, busca)` (nome ou sistema, sem acento nem caixa) e `continueCandidate(mesas)` (a de `lastEnteredAt` mais recente, ou `null`)
- `src/lib/campaign-meta.ts` — `campaignMeta(mesa)` ("Tormenta20 · mestre: Bia · 4 participantes"; o mestre só aparece para quem joga; sem o status), `memberCountLabel(n)`, `ROLE_LABEL`
- `src/services/http-transport.ts` — `HttpTransport` (interface; `GET`, `POST`, `PUT`, `PATCH`, `DELETE`; `upload(path, file, 'POST' | 'PUT')`), `FetchHttpTransport` (base `/api`, JSON, `credentials: 'same-origin'`), `NetworkUnavailableError`; resposta com `body` JSON, `null` se vazia, `undefined` se não-JSON
- `src/services/api-call.ts` — o comum a todo serviço: `callApi(transport, método, caminho, corpo?)` → `ok` (status < 300) | `refused` (com a resposta, para o serviço nomear o `kind`) | `offline`; `parseOk(dto, corpo, pick)` (corpo fora do DTO → `unexpected`); `retryAfterOf(resposta)` (`Retry-After`, senão `retryAfterSeconds` do corpo, senão 60); `errorCodeOf(resposta)`
- `src/services/auth-api.ts` — `AuthApi` / `HttpAuthApi` (falhas, `login` e `verifyTwoFactor` em [`auth.md`](auth.md), Client)
- `src/services/{profile-api,account-security-api,account-failure}.ts` — ver [`client/account.md`](client/account.md); `user-admin-api.ts`, `account-links-api.ts` — ver os sub-docs do backoffice e dos links
- `src/services/campaigns-api.ts` — `CampaignsApi` / `HttpCampaignsApi`: `list`, `create`, `detail`, `join`, `enter`, `update`, `regenerateCode`, `remove`, cada um devolvendo `CampaignsResult<T>`; falhas em [`client/campaign-parts.md`](client/campaign-parts.md)
- `src/services/realtime-transport.ts` — `RealtimeTransport` / `SocketIoRealtimeTransport`: o único lugar do `socket.io-client` ([`client/realtime.md`](client/realtime.md))
- `src/services/table-session-api.ts` — `TableSessionApi` / `RealtimeTableSessionApi`: várias mesas sobre um socket, `open(campaignId, listener)` → handle com `close`, `setAway`, `watch`, `followCast` ([`client/realtime.md`](client/realtime.md))
- `src/services/clipboard.ts` — `Clipboard` (interface) e `NavigatorClipboard` (`copy(texto)` → `false` quando o navegador recusa; `readText()` → `null`)
- `src/stores/rail-store.ts` — `createRailStore(storage)` (Zustand vanilla), `useRail(store)`; `rail` = `expanded` (padrão) | `collapsed`, gravado em `localStorage` (`lorkarium.rail`); storage que lança cai na memória
- `src/stores/open-tables-store.ts` — `createOpenTablesStore({ api, storage, createInteraction })`: as mesas abertas da aba (até `MAX_OPEN_TABLES`, no `sessionStorage`), cada uma com presença, tabuleiro, elenco, edição e abas ([`client/realtime.md`](client/realtime.md))
- `src/stores/table-presence-store.ts` — `createTablePresenceStore(campaignId)`: quem está na mesa, com a regra de versão ([`client/realtime.md`](client/realtime.md))
- `src/stores/session-store.ts` — `createSessionStore()` (Zustand vanilla), singleton `sessionStore`, hook `useSession(store)`; estado `unknown { reconnecting }` (`serverUnreachable()`) → `authenticated { user }` | `anonymous`

## Rotas

| Caminho                                   | Acesso        | Tela                                                                                                                                           |
| ----------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                                  | `public-only` | `LoginPage`; logado vai para o `next` seguro ou `/`                                                                                            |
| `/account`                                | `signed-in`   | shell + "Minha conta" ([`client/account.md`](client/account.md))                                                                               |
| `/account/email/confirm`                  | `anyone`      | confirmação da troca de e-mail (fora do shell)                                                                                                 |
| `/`                                       | `signed-in`   | shell + `HomePage` (`loader` da lista, `action` de criar/entrar por código)                                                                    |
| `/campaigns/:campaignId`                  | `signed-in`   | a home com o modal de detalhes por cima (`loader` do detalhe, `action` de "Entrar na mesa")                                                    |
| `/campaigns/:campaignId/table`            | `signed-in`   | shell (trilho compacto) + sala de jogo (`loader` do detalhe, `handle: COMPACT_RAIL_HANDLE`)                                                    |
| `/campaigns/:campaignId/table/library`    | `signed-in`   | biblioteca em modal sobre a sala ([`client/library.md`](client/library.md))                                                                    |
| `/campaigns/:campaignId/table/settings`   | `signed-in`   | "Configurações da mesa": página sobre a sala, só o mestre; jogador volta à sala ([`client/campaign-settings.md`](client/campaign-settings.md)) |
| `/campaigns/:campaignId/table/conditions` | `signed-in`   | "Condições da mesa": página sobre a sala, só o mestre; jogador volta à sala ([`client/conditions.md`](client/conditions.md))                   |
| `/account/recover`                        | `anyone`      | recuperação pelo link "Não fui eu" (fora do shell)                                                                                             |
| `/invite` · `/reset-password`             | `anyone`      | aceitar convite · nova senha pelo link do admin (fora do shell)                                                                                |
| `/admin` → `/admin/users`                 | `admin`       | backoffice, `lazy` (fora do shell): moldura própria + "Usuários"                                                                               |
| `*`                                       | —             | redireciona para `/`                                                                                                                           |

- O root tem `middleware` que faz o `GET /api/auth/me` enquanto a sessão está `unknown` (repetido enquanto o server não responde) e o `HydrateFallback` (splash) cobre essa espera. Cada rota tem um `middleware` de guarda que chama `decideAccess` e lança `redirect`; as rotas logadas vivem sob a rota de layout `shell` (sem `path`, guarda `signed-in`).
- A rota `shell` tem um segundo `middleware`, `restoreOpenTables`: com a sessão autenticada, `openTables.restore(user.id)` (idempotente) reabre as mesas da aba depois de um F5. "Sair" no menu chama `openTables.closeAll()` **antes** do `authApi.logout()` (depois, o server recusaria os `session:leave` e os outros só veriam a saída depois da tolerância).
- Árvore: `root` → `login` · `account/email/confirm` · `account/recover` · `invite` · `reset-password` · `admin` → [índice, `users`] · `shell` → [`home` (`path: '/'`) → [índice, `campaigns/:campaignId`], `account` (id `account`), `campaigns/:campaignId/table` (id `campaign-table`) → [índice, `library`, `settings`]] · `*`.
- Visitante em rota protegida vai para `/login?next=<caminho+query codificados>`; depois do login, `safeRedirectTarget(next)`. `loader`/`action` que recebe `unauthenticated` faz o mesmo (`redirectIfSignedOut`), menos a `action` chamada por **fetcher**: ela lança para o `ErrorBoundary`, que rende o `SignedOutRedirect` (ver [`client/armadilhas.md`](client/armadilhas.md)).
- A guarda do client só evita mostrar a tela errada; quem recusa é o server.

## Regras de arquitetura

- Componente shadcn novo entra por `pnpm exec shadcn add <nome> -y` (rodado em `client/`) e é ajustado aos tokens do design system no próprio arquivo (raio de 4px, sem sombra nem blur, rótulos em pt-BR).
- Texto de interface em pt-BR; identificadores em inglês.
- Rede só por `src/services/` sobre `HttpTransport`; serviço devolve falha como valor, a tela só traduz o `kind` em mensagem.
- Dados de tela pelo modo data: lista e detalhe por `loader`, mutação por `action` (o router revalida sozinho); envio sem navegação por `useFetcher`. O Zustand fica para sessão, trilho e (depois) tempo real.
- Em dev, o Vite faz proxy de `/api` para `http://localhost:3333` com `ws: true` (o upgrade do Socket.IO em `/api/socket.io`) e sem `changeOrigin` (o server compara `Origin` com `Host`); o `vite preview` herda o mesmo proxy. Em produção é a mesma origem: o **server** entrega o `client/dist` (`CLIENT_DIST_DIR`, ver `server.md`) — `/assets/*` com `immutable` de um ano, o `index.html` e o resto da raiz com `no-cache`, e qualquer outro `GET` fora de `/api` e `/assets` cai no `index.html` (deep link do React Router). Por isso `/api` e `/assets/` são **reservados**: rota do client com esses prefixos nunca abre. Sem CORS e com cookie first-party.

## Testes

- Vitest do projeto `@lorkarium/client` em `jsdom` (`client/vite.config.ts`, bloco `test`); specs em `client/test/` espelhando `src/` e importando por `@/...`.
- `client/test/setup.ts` carrega o jest-dom e faz `cleanup` depois de cada `it` (sem globals do Vitest, o Testing Library não se limpa sozinho).
- `client/test/jest-dom.d.ts` tipa os matchers do jest-dom no `Matchers<R, T>` do Vitest 5.
- `client/test/support/app-dependencies.ts` — `testDependencies()`: todo o `AppDependencies` em fakes (cada store lembrada no navegador sobre o próprio `StorageFake`: `drawingStyleStorage`, `effectAreaStyleStorage`, `wallStyleStorage`, `lightReachStorage`, `lightColorStorage`, `roomLayoutStorage`) (o `openTables` real sobre o `TableSessionApiFake` e um `StorageFake`, expostos como `tableSessionApi` e `tabStorage`), `interactionClock` = `InteractionClockFake` (o relógio da sala movido à mão), `now` fixo (`TEST_NOW`, quarta 14/10/2026), `random` = 0 ("E aí, {nome}.") e `waitBeforeRetry` = `retryWaits` (`RetryWaitFake`).
- `ProfileApiFake` e `AccountSecurityApiFake` (no `testDependencies()`): ver [`client/account.md`](client/account.md).
- `client/test/support/http-transport-fake.ts` — `HttpTransportFake` (`respondWith(status, body, headers)`, `failWithNetworkDown()`, `requests`).
- `client/test/support/campaigns-api-fake.ts` — `CampaignsApiFake` (`answer(método, resultado)`, `hold(método)`, `callsOf(método)`), mesas `VHARN` (mestre, entrou por último) e `QUELM` (jogador, pública, Tormenta20) e `detailOf(resumo, overrides)`; status, capa, avisos e tags das fixtures em [`client/campaign-parts.md`](client/campaign-parts.md).
- `client/test/support/realtime-transport-fake.ts` — `RealtimeTransportFake` (`sent`, `connects`, `disconnects`; `answerAck(resposta)` / `timeOutAck()` resolvem o ack mais antigo; `serverEmits(evento, payload)`; `lifecycle(mudança)`; `isConnected()` segue a última mudança). `table-session-fixtures.ts` — membros `ANA_AT_TABLE`, `BIA_AT_TABLE` (offline), `CAIO_AT_TABLE`, `vharnState(overrides)`, `biaJoined()`, `biaLeft()`.
- `client/test/support/table-session-api-fake.ts` — `TableSessionApiFake` (`opened`, `closedIds` e `closed` = quantos, `emit(...updates)` ao último listener e `emitTo(campaignId, ...updates)` ao da mesa, dentro de `act`); está no `testDependencies()`.
- `client/test/support/call-journal.ts` — `CallJournal` (`entries`): o `AuthApiFake` escreve `logout` e o `TableSessionApiFake` `close:<id>`; no `testDependencies()` os dois dividem o mesmo (`deps.journal`).
- `client/test/support/clipboard-fake.ts` (`ClipboardFake`, `copied`, `pasteText`), `field-editing-fake.ts` (`FieldEditingFake`) e `storage-fake.ts` (`StorageFake`, `values`, `removeItem`; `new StorageFake(true)` lança como storage bloqueado).
- Tela com `loader`/`action` se prova pelo router inteiro (`createMemoryRouter(buildRoutes(testDependencies()))`); os subcomponentes de diálogo e da home não têm spec próprio, são provados pelo spec do pai.
- Componente se prova pelo que o usuário vê: `getByRole`/`getByLabelText` + `toHaveTextContent`/`toBeDisabled`/`toHaveAttribute`, não classe CSS.

## Armadilhas

Em [`client/armadilhas.md`](client/armadilhas.md) (React Router, Radix/shadcn, React Compiler, jsdom, Playwright).
