# Client

SPA React 19 + Vite 8 em `client/` (alias `@/*` → `src/*`). Tela em `src/features/<área>/`, componente compartilhado em `src/components/`, rede em `src/services/`, estado em `src/stores/`, moldura do app em `src/app/shell/`, tabuleiro em `src/renderer/` (PixiJS, sem React; ver [`client/board-renderer.md`](client/board-renderer.md)).

> **Detalhe por assunto em [`client/`](client/) — abra só o arquivo da tarefa.** Este hub guarda a estrutura, as rotas e os testes.

| Assunto                                                                                     | Arquivo                                         |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Tokens de cor, tipografia, forma, componentes base e regras anti-template                   | [`design-system.md`](client/design-system.md)   |
| Shell (trilho, menu, gaveta), home, diálogos de mesa e detalhe                              | [`home.md`](client/home.md)                     |
| Sala de jogo: tabuleiro, renderer, câmera, ferramentas, sync e comandos                     | [`board.md`](client/board.md)                   |
| Renderer PixiJS: câmera, entrada, `BoardView`, hover, faixas, adaptador                     | [`board-renderer.md`](client/board-renderer.md) |
| Tokens na sala: arraste, teclado, lista "Na cena", detalhe, diálogo e barras                | [`tokens.md`](client/tokens.md)                 |
| Diálogo do token: prévia (lugar da imagem), abas Básico, Barras, Visão e luz                | [`token-dialog.md`](client/token-dialog.md)     |
| Rodapé do token (`TokenDock`): selecionado ou principal, `mainTokenIdOf`, `token:setMain`   | [`token-dock.md`](client/token-dock.md)         |
| Aba "Na mesa": mestres, card de cada jogador (ficha, token principal, barras), ausência     | [`table-people.md`](client/table-people.md)     |
| Combate na sala: tracker, iniciativa, turnos, condições e a vez no tabuleiro                | [`combat.md`](client/combat.md)                 |
| Desenhos na sala, copiar/colar (Ctrl+C/V) e desfazer/refazer (Ctrl+Z/Y)                     | [`drawings.md`](client/drawings.md)             |
| Áreas de efeito na sala: estado, ferramenta (M), seleção, alças, copiar                     | [`effect-areas.md`](client/effect-areas.md)     |
| Paredes e portas na sala: estado, ferramenta (P), linhas, edição, portas                    | [`walls.md`](client/walls.md)                   |
| Visão: alcance do token, modo da cena, filtro, névoa, rota, prévia do mestre                | [`vision.md`](client/vision.md)                 |
| Luzes: estado, comandos, luz do token, ferramenta (L), ícones, acender                      | [`lights.md`](client/lights.md)                 |
| Cone: campo de visão, lanterna, holofote mirado, contorno do mestre                         | [`cones.md`](client/cones.md)                   |
| Desempenho: orçamento, regras que não podem ser desfeitas, cena de estresse, bench, painel  | [`performance.md`](client/performance.md)       |
| Biblioteca de grids: rota, modal, árvore de pastas e grids, menu, painel e arrastar         | [`library.md`](client/library.md)               |
| Abas de grid na sala: escopo do comando, `watch`, `scene-tabs-store`, `SceneTabs`           | [`grid-tabs.md`](client/grid-tabs.md)           |
| Personagem: elenco, token ligado composto, ligar à ficha, "Adicionar jogadores"             | [`characters.md`](client/characters.md)         |
| Ping no mapa: cor por pessoa, segurar/Alt+clique, pulso do anel, seta na borda              | [`pings.md`](client/pings.md)                   |
| Minha conta: perfil, foto, barra de alterações, senha, e-mail, sessões, 2FA, link do e-mail | [`account.md`](client/account.md)               |
| Armadilhas gerais do client (router, Radix, React Compiler, jsdom, Playwright)              | [`armadilhas.md`](client/armadilhas.md)         |

## Estrutura

- `src/main.tsx` — monta `createBrowserRouter(buildRoutes(deps))` com os adaptadores reais (`HttpAuthApi`, `HttpCampaignsApi`, `createOpenTablesStore` (com `tabInteractionFactory(boardCommands)`) sobre a `RealtimeTableSessionApi` (sobre `SocketIoRealtimeTransport` com `crypto.randomUUID`) e o `sessionStorage`, `NavigatorClipboard`, `createRailStore` sobre o `localStorage`, `new Date()`, `Math.random`)
- `src/app/router.tsx` — `buildRoutes(deps)`: rotas do modo data do React Router 8 (abaixo); `AppDependencies` = `{ authApi, campaignsApi, profileApi, accountSecurityApi, libraryApi, sceneActivation, assets, clipboard, openTables, sessionStore, railStore, roomLayout, drawingStyle, effectAreaStyle, wallStyle, lightReach, lightColor, createBoardRenderer, boardCommands, interactionClock, now, random }`, para o teste injetar fakes
- `src/app/route-access.ts` — `decideAccess(session, access, url)`: decisão pura `allow` | `redirect` por `RouteAccess` (`public-only`, `signed-in`, `admin`, `anyone`); `loginPathFor(url)` → `/login?next=…`
- `src/app/splash-screen.tsx` (`role="status"`, "Carregando…") e `src/app/route-error-screen.tsx`
- `src/app/shell/` — `AppShell`, trilho, menu do usuário, gaveta e `api-loader.ts` (ver [`client/home.md`](client/home.md))
- `src/features/auth/` — tela de login em duas etapas (ver [`auth.md`](auth.md)); `src/features/account/` — "Minha conta" (ver [`client/account.md`](client/account.md)); `src/features/home/`, `src/features/campaigns/` e `src/features/sessions/` (`useOpenTable` e `useSignOutWhenRefused`, ver [`client/home.md`](client/home.md); a aba "Na mesa" — card, linha do mestre, ausência —, ver [`client/table-people.md`](client/table-people.md)); `src/features/admin/admin-page.tsx` — placeholder
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
- `src/components/campaign-cover.tsx` (capa SVG `aria-hidden`) e `copy-code-button.tsx` ("Copiar código", ou o `label` dado, + `role="status"`)
- `src/components/load-error-screen.tsx` — `LoadErrorScreen({ pageTitle, failedHeading })`: `ErrorBoundary` de `loader` (home e conta)
- `src/components/user-avatar.tsx` — `UserAvatar`: foto ou iniciais na cor, em círculo (ver [`client/table-people.md`](client/table-people.md))
- `src/lib/utils.ts` — `cn`
- `src/lib/stored-choice.ts` — `readStoredChoice(storage, chave, opções, padrão)` / `writeStoredChoice`: preferência de UI no `localStorage` que cai na memória se o storage lança (trilho e painel da sala)
- `src/lib/use-media-query.ts` — `useMediaQuery(query)` e `DESKTOP_QUERY` (`md`); sem `matchMedia` (jsdom) responde `true`
- `src/lib/board-shortcuts.ts`, `ruler-label.ts` — atalhos e régua da sala (ver [`client/board.md`](client/board.md))
- `src/lib/table-roster.ts`, `member-presence.ts`, `idle-watch.ts`, `away-label.ts` — seções, presença, inatividade e "ausente há N min" da aba "Na mesa" (ver [`client/table-people.md`](client/table-people.md))
- `src/lib/cells-text.ts` — `cellsText(1.5)` → `'1,5'`: casas com vírgula (detalhe, anúncio e formulário do token)
- `src/lib/token-side.ts` — `sideRingVar(lado)` → `var(--label)` / `var(--chart-3)` / `var(--chart-2)`: a cor do anel do token no DOM (a prévia do diálogo; o canvas tem os hex)
- `src/lib/safe-redirect.ts` — `safeRedirectTarget(next)`: só caminho interno; `//x`, `/\x`, URL absoluta, `javascript:`, vazio e `/login` viram `/`
- `src/lib/greeting.ts` — `GREETINGS` (as 10 saudações da home) e `greetingFor(nome, sorteio ∈ [0, 1))` com o primeiro nome; sorteio fora do intervalo → `RangeError`
- `src/lib/overline-date.ts` — `formatOverlineDate(data)` → "Quarta, 14 de outubro" (sem "-feira", hora local)
- `src/lib/campaign-cover.ts` — `coverFor(id)` → `{ variant: 0..2, tone: 1..4 }` estável por id (`stableHash` do game-core)
- `src/lib/campaign-code.ts` — `formatCampaignCode('VHRN7K2Q')` → `'VHRN-7K2Q'` e `maskCampaignCode(digitado)` (máscara do campo: só letras e dígitos, caixa alta, até 8, hífen depois do 4º; quem valida continua sendo o DTO)
- `src/lib/search-text.ts` — `searchText('Ossuário')` → `'ossuario'`: o texto de busca sem acento nem caixa (mesas e biblioteca)
- `src/lib/folder-tree.ts` — árvore, árvore filtrada pela busca e `canDrop` da biblioteca; `edited-label.ts` — "editado há 3 dias" (ver [`client/library.md`](client/library.md))
- `src/lib/use-draft-field.ts` — `useDraftField({ confirmed, normalize?, save })`: rascunho × confirmado (ficha, nome do grid)
- `src/lib/{member-since,since-label,device-label,two-factor-text,avatar-file,download-text}.ts` — de "Minha conta" ([`client/account.md`](client/account.md))
- `src/lib/campaign-list.ts` — `filterCampaigns(mesas, busca)` (nome ou sistema, sem acento nem caixa) e `continueCandidate(mesas)` (a de `lastEnteredAt` mais recente, ou `null`)
- `src/lib/campaign-meta.ts` — `campaignMeta(mesa)` ("Tormenta20 · mestre: Bia · 4 participantes"; o mestre só aparece para quem joga), `memberCountLabel(n)`, `ROLE_LABEL`
- `src/services/http-transport.ts` — `HttpTransport` (interface; `GET`, `POST`, `PUT`, `PATCH`, `DELETE`; `upload(path, file, 'POST' | 'PUT')`), `FetchHttpTransport` (base `/api`, JSON, `credentials: 'same-origin'`), `NetworkUnavailableError`; resposta com `body` JSON, `null` se vazia, `undefined` se não-JSON
- `src/services/api-call.ts` — o comum a todo serviço: `callApi(transport, método, caminho, corpo?)` → `ok` (status < 300) | `refused` (com a resposta, para o serviço nomear o `kind`) | `offline`; `parseOk(dto, corpo, pick)` (corpo fora do DTO → `unexpected`); `retryAfterOf(resposta)` (`Retry-After`, senão `retryAfterSeconds` do corpo, senão 60); `errorCodeOf(resposta)`
- `src/services/auth-api.ts` — `AuthApi` / `HttpAuthApi`: devolve `AuthResult` (nunca lança); falhas `invalid_credentials` (401), `rate_limited` (429), `offline`, `unexpected`. O `login` devolve `LoginResult`: `{ status: 'two-factor-required' }` do server vira a falha `two_factor_required` (`LoginFailure` = `AuthFailure` + ela); `verifyTwoFactor` é a 2ª etapa (ver [`auth.md`](auth.md), Client)
- `src/services/{profile-api,account-security-api,account-failure}.ts` — ver [`client/account.md`](client/account.md)
- `src/services/campaigns-api.ts` — `CampaignsApi` / `HttpCampaignsApi`: `list`, `create`, `detail`, `join`, `enter`, cada um devolvendo `CampaignsResult<T>`; falhas (`CampaignsFailure`): `unauthenticated` (401), `not_found` (404), `invalid` (400), `password_required` / `password_invalid` (403 pelo `code`), `rate_limited` (429), `offline`, `unexpected`
- `src/services/realtime-transport.ts` — `RealtimeTransport` (interface: `connect`, `disconnect`, `isConnected`, `emit`, `emitWithAck(evento, payload, ms)`, `on(evento)` e `onLifecycle` → `connected` | `disconnected { willRetry }` | `connect_failed { code, willRetry }`) e `SocketIoRealtimeTransport` (`io(realtimeClientOptions())`: `path: REALTIME_PATH`, `autoConnect: false`, `withCredentials: true`, `transports: ['websocket', 'polling']` com `tryAllTransports` — websocket direto, sem a volta de polling antes, e polling só se o websocket falhar; casca fina provada pelo e2e, as opções por `test/services/realtime-transport.spec.ts`). O `socket.io-client` só aparece aqui.
- `src/services/table-session-api.ts` — `TableSessionApi` / `RealtimeTableSessionApi(transport, newActionId)`: `open(campaignId, listener)` → `{ close }`. Entrega ao listener `status` (`connecting` → `live`; queda com nova tentativa → `reconnecting`), `state` (o snapshot do ack do `session:join`), `memberJoined`/`memberLeft` (só os da mesa aberta e válidos pelo DTO) e `failed` (`not_found`, `unauthenticated` — ack ou `connect_error` —, `too_many_tables`, `unexpected`, `offline` — ack que não chega em 5 s ou queda sem nova tentativa). **Várias mesas sobre um socket só**: `connect` na primeira visita, `disconnect` quando a última fecha; a visita que abre com a conexão de pé (`isConnected()`) emite o `session:join` na hora. A cada `connected` (inclusive reconexão) toda visita viva reemite o seu `session:join` e recebe snapshot novo. `close()` emite o `session:leave` daquela mesa e nada mais chega ao listener dela. `setAway(away)` emite `session:setActivity` e o repete depois de cada rejoin; `session:memberActivity` chega como `memberActivity` (ver [`client/table-people.md`](client/table-people.md), Ausência); `session:memberUpdated` válido e da mesa → `memberUpdated`. `board:pinged` → `pinged` ([`client/pings.md`](client/pings.md)).
- `src/services/clipboard.ts` — `Clipboard` (interface) e `NavigatorClipboard` (`copy(texto)` → `false` quando o navegador recusa)
- `src/stores/rail-store.ts` — `createRailStore(storage)` (Zustand vanilla), `useRail(store)`; `rail` = `expanded` (padrão) | `collapsed`, gravado em `localStorage` (`lorkarium.rail`); storage que lança cai na memória
- `src/stores/open-tables-store.ts` — `createOpenTablesStore({ api, storage })` (Zustand vanilla) e `useOpenTables(store, seletor)`: as mesas abertas **da aba**. Estado `{ ownerId, tables: { campaignId, name, presence }[], sessionRefused }`; ações `setAway(away)` (a todas as mesas abertas, e às que abrirem enquanto a aba está parada), `restore(userId)` (reabre a lista gravada se o dono for o mesmo; outro dono fecha as abertas antes; idempotente), `open({ campaignId, name })` → `opened` | `already-open` | `full` (com `MAX_OPEN_TABLES`), `close(id)` e `closeAll()` (logout: fecha tudo, limpa o storage, dono `null`). Os handles ficam num `Map` fora do estado. Cada `OpenTable` leva `presence`, `board` e `edits` (os da aba do grupo; ver [`client/drawings.md`](client/drawings.md)) e `tabs` (a `scene-tabs-store`, ver [`client/grid-tabs.md`](client/grid-tabs.md)); `OpenTablesDeps.createInteraction` dá a interação de cada aba. Persistida no `sessionStorage` (`lorkarium.openTables` = `{ userId, tables: [{ campaignId, name }] }`, lida por um schema Zod local; inválida, de outro dono ou acima do limite → lista vazia; storage que lança cai na memória). `failed: unauthenticated` de qualquer mesa → `sessionRefused: true`.
- `src/stores/table-presence-store.ts` — `createTablePresenceStore(campaignId)` (Zustand vanilla, **uma por mesa aberta**, criada pela `open-tables-store`), `useTablePresence(store, seletor)`, `selectOnlineCount(estado)`. Estado `{ campaignId, status (connecting | live | reconnecting | failed), failure, version (null até o snapshot), members }`; `apply(update)` recebe o `TableSessionUpdate` do serviço. Regra de versão: o snapshot **sempre** substitui (inclusive de versão menor, depois de o server reiniciar); evento só se aplica com versão **maior** que a atual, da mesma mesa e depois de algum snapshot. `memberJoined` de quem está na lista marca online no lugar; de quem não está, entra no fim. `memberLeft` marca offline (e zera o `awaySince`) e mantém na lista. `memberActivity` troca o `awaySince` do membro. `memberUpdated` troca o membro no lugar, mantendo `online`/`awaySince`.
- `src/stores/session-store.ts` — `createSessionStore()` (Zustand vanilla), singleton `sessionStore`, hook `useSession(store)`; estado `unknown` → `authenticated { user }` | `anonymous`

## Rotas

| Caminho                                | Acesso        | Tela                                                                                        |
| -------------------------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `/login`                               | `public-only` | `LoginPage`; logado vai para o `next` seguro ou `/`                                         |
| `/account`                             | `signed-in`   | shell + "Minha conta" ([`client/account.md`](client/account.md))                            |
| `/account/email/confirm`               | `anyone`      | confirmação da troca de e-mail (fora do shell)                                              |
| `/`                                    | `signed-in`   | shell + `HomePage` (`loader` da lista, `action` de criar/entrar por código)                 |
| `/campaigns/:campaignId`               | `signed-in`   | a home com o modal de detalhes por cima (`loader` do detalhe, `action` de "Entrar na mesa") |
| `/campaigns/:campaignId/table`         | `signed-in`   | shell (trilho compacto) + sala de jogo (`loader` do detalhe, `handle: COMPACT_RAIL_HANDLE`) |
| `/campaigns/:campaignId/table/library` | `signed-in`   | biblioteca em modal sobre a sala ([`client/library.md`](client/library.md))                 |
| `/admin`                               | `admin`       | `AdminPage`, carregada por `lazy` (fora do shell)                                           |
| `*`                                    | —             | redireciona para `/`                                                                        |

- O root tem `middleware` que faz **um** `GET /api/auth/me` enquanto a sessão está `unknown` e o `HydrateFallback` (splash) cobre essa espera. Cada rota tem um `middleware` de guarda que chama `decideAccess` e lança `redirect`; as rotas logadas vivem sob a rota de layout `shell` (sem `path`, guarda `signed-in`).
- A rota `shell` tem um segundo `middleware`, `restoreOpenTables`: com a sessão autenticada, `openTables.restore(user.id)` (idempotente) reabre as mesas da aba depois de um F5. "Sair" no menu chama `openTables.closeAll()` **antes** do `authApi.logout()` (depois, o server recusaria os `session:leave` e os outros só veriam a saída depois da tolerância).
- Árvore: `root` → `login` · `account/email/confirm` · `admin` · `shell` → [`home` (`path: '/'`) → [índice, `campaigns/:campaignId`], `account` (id `account`), `campaigns/:campaignId/table` (id `campaign-table`) → [índice, `library`]] · `*`.
- Visitante em rota protegida vai para `/login?next=<caminho+query codificados>`; depois do login, `safeRedirectTarget(next)`. `loader`/`action` que recebe `unauthenticated` faz o mesmo (`redirectIfSignedOut`), menos a `action` chamada por **fetcher**: ela lança para o `ErrorBoundary`, que rende o `SignedOutRedirect` (ver [`client/armadilhas.md`](client/armadilhas.md)).
- A guarda do client só evita mostrar a tela errada; quem recusa é o server.

## Regras de arquitetura

- Componente shadcn novo entra por `pnpm exec shadcn add <nome> -y` (rodado em `client/`) e é ajustado aos tokens do design system no próprio arquivo (raio de 4px, sem sombra nem blur, rótulos em pt-BR).
- Texto de interface em pt-BR; identificadores em inglês.
- Rede só por `src/services/` sobre `HttpTransport`; serviço devolve falha como valor, a tela só traduz o `kind` em mensagem.
- Dados de tela pelo modo data: lista e detalhe por `loader`, mutação por `action` (o router revalida sozinho); envio sem navegação por `useFetcher`. O Zustand fica para sessão, trilho e (depois) tempo real.
- Em dev, o Vite faz proxy de `/api` para `http://localhost:3333` com `ws: true` (o upgrade do Socket.IO em `/api/socket.io`) e sem `changeOrigin` (o server compara `Origin` com `Host`); o `vite preview` herda o mesmo proxy. Em produção é a mesma origem. Sem CORS e com cookie first-party.

## Testes

- Vitest do projeto `@lorkarium/client` em `jsdom` (`client/vite.config.ts`, bloco `test`); specs em `client/test/` espelhando `src/` e importando por `@/...`.
- `client/test/setup.ts` carrega o jest-dom e faz `cleanup` depois de cada `it` (sem globals do Vitest, o Testing Library não se limpa sozinho).
- `client/test/jest-dom.d.ts` tipa os matchers do jest-dom no `Matchers<R, T>` do Vitest 5.
- `client/test/support/app-dependencies.ts` — `testDependencies()`: todo o `AppDependencies` em fakes (cada store lembrada no navegador sobre o próprio `StorageFake`: `drawingStyleStorage`, `effectAreaStyleStorage`, `wallStyleStorage`, `lightReachStorage`, `lightColorStorage`, `roomLayoutStorage`) (o `openTables` real sobre o `TableSessionApiFake` e um `StorageFake`, expostos como `tableSessionApi` e `tabStorage`), `interactionClock` = `InteractionClockFake` (o relógio da sala movido à mão), `now` fixo (`TEST_NOW`, quarta 14/10/2026) e `random` = 0 ("E aí, {nome}.").
- `ProfileApiFake` e `AccountSecurityApiFake` (no `testDependencies()`): ver [`client/account.md`](client/account.md).
- `client/test/support/http-transport-fake.ts` — `HttpTransportFake` (`respondWith(status, body, headers)`, `failWithNetworkDown()`, `requests`).
- `client/test/support/campaigns-api-fake.ts` — `CampaignsApiFake` (`answer(método, resultado)`, `hold(método)`, `callsOf(método)`), mesas `VHARN` (mestre, entrou por último) e `QUELM` (jogador, pública, Tormenta20) e `detailOf(resumo, overrides)`.
- `client/test/support/realtime-transport-fake.ts` — `RealtimeTransportFake` (`sent`, `connects`, `disconnects`; `answerAck(resposta)` / `timeOutAck()` resolvem o ack mais antigo; `serverEmits(evento, payload)`; `lifecycle(mudança)`; `isConnected()` segue a última mudança). `table-session-fixtures.ts` — membros `ANA_AT_TABLE`, `BIA_AT_TABLE` (offline), `CAIO_AT_TABLE`, `vharnState(overrides)`, `biaJoined()`, `biaLeft()`.
- `client/test/support/table-session-api-fake.ts` — `TableSessionApiFake` (`opened`, `closedIds` e `closed` = quantos, `emit(...updates)` ao último listener e `emitTo(campaignId, ...updates)` ao da mesa, dentro de `act`); está no `testDependencies()`.
- `client/test/support/call-journal.ts` — `CallJournal` (`entries`): o `AuthApiFake` escreve `logout` e o `TableSessionApiFake` `close:<id>`; no `testDependencies()` os dois dividem o mesmo (`deps.journal`).
- `client/test/support/clipboard-fake.ts` (`ClipboardFake`, `copied`) e `storage-fake.ts` (`StorageFake`, `values`, `removeItem`; `new StorageFake(true)` lança como storage bloqueado).
- Tela com `loader`/`action` se prova pelo router inteiro (`createMemoryRouter(buildRoutes(testDependencies()))`); os subcomponentes de diálogo e da home não têm spec próprio, são provados pelo spec do pai.
- Componente se prova pelo que o usuário vê: `getByRole`/`getByLabelText` + `toHaveTextContent`/`toBeDisabled`/`toHaveAttribute`, não classe CSS.

## Armadilhas

Em [`client/armadilhas.md`](client/armadilhas.md) (React Router, Radix/shadcn, React Compiler, jsdom, Playwright).
