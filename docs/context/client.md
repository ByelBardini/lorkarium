# Client

SPA React 19 + Vite 8 em `client/` (alias `@/*` → `src/*`). Tela em `src/features/<área>/`, componente compartilhado em `src/components/`, rede em `src/services/`, estado em `src/stores/`, moldura do app em `src/app/shell/`, tabuleiro em `src/renderer/` (PixiJS, sem React; ver [`client/board-renderer.md`](client/board-renderer.md)), dados 3D em `src/dice-renderer/` (o único lugar do `three`) e som dos dados em `src/dice-audio/` (ver [`client/dice.md`](client/dice.md)).

> **Detalhe por assunto em [`client/`](client/) — abra só o arquivo da tarefa.** Este hub guarda a estrutura e os testes.

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
| Diálogo do token: prévia (lugar da imagem), abas Básico, Barras, Formas, Visão e luz        | [`token-dialog.md`](client/token-dialog.md)           |
| Formas no mapa: `token:formChanged`, `setTokenForm`, desfazer, "Trocar forma", teclas 1–8   | [`token-forms.md`](client/token-forms.md)             |
| Chaves de token da mesa: o jogador cria, edita e exclui os seus                             | [`token-rights.md`](client/token-rights.md)           |
| Auras dos tokens: estado e eventos, formulário (`AuraEditor`), onde se edita, desenho       | [`auras.md`](client/auras.md)                         |
| Rodapé do token (`TokenDock`): selecionado ou principal, `mainTokenIdOf`, `token:setMain`   | [`token-dock.md`](client/token-dock.md)               |
| Aba "Na mesa": mestres, card de cada jogador (ficha, token principal, barras), ausência     | [`table-people.md`](client/table-people.md)           |
| Papéis na mesa: dono, co-mestre, juggernaut, troca de papel e o modo do admin               | [`table-roles.md`](client/table-roles.md)             |
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
| Dados: rede, stores, 3D (conta e adaptador), e o índice da aba "Dados"                      | [`dice.md`](client/dice.md)                           |
| Aba "Dados": bandeja, salvas em etiquetas, histórico em linhas, aviso sobre o tabuleiro     | [`dice-tab.md`](client/dice-tab.md)                   |
| Chat da mesa: `chat:send`/`chat:sent`, store de conversas, leitura do campo, feed, destino  | [`chat.md`](client/chat.md)                           |
| Chat em outra janela: porta da janela, portal, container dos portais Radix                  | [`chat-janela.md`](client/chat-janela.md)             |
| Rotas: tabela, guardas, `restoreOpenTables`, árvore, `next` do login                        | [`rotas.md`](client/rotas.md)                         |
| Links de conta: `/invite` (escolher @ e senha) e `/reset-password`                          | [`account-links.md`](client/account-links.md)         |
| Barra de título do app desktop: `WindowTitleBar`, controles, lugar por rota, slot da sala   | [`title-bar.md`](client/title-bar.md)                 |
| Menu dos campos de texto no app desktop: `isDesktopShell`, itens, `FieldEditing`, raiz      | [`text-field-menu.md`](client/text-field-menu.md)     |
| Versão nova depois do deploy: impressão do build, aviso, recarga segura                     | [`app-update.md`](client/app-update.md)               |
| Testes: Vitest em jsdom, setup, `testDependencies()`, fakes do `test/support/`              | [`testes.md`](client/testes.md)                       |
| Armadilhas gerais do client (router, Radix, React Compiler, jsdom, Playwright)              | [`armadilhas.md`](client/armadilhas.md)               |

## Estrutura

- `src/main.tsx` — monta `createBrowserRouter(buildRoutes(deps))` com os adaptadores reais (`HttpAuthApi`, `HttpCampaignsApi`, `createOpenTablesStore` (com `tabInteractionFactory(boardCommands)`) sobre a `RealtimeTableSessionApi` (sobre `SocketIoRealtimeTransport` com `crypto.randomUUID`) e o `sessionStorage`, `NavigatorClipboard`, `isDesktopShell`, `desktopWindow` (`TauriDesktopWindow` só com `desktopShellOf(ua)?.titleBar`, senão `null`), `DocumentFieldEditing`, `createRailStore` sobre o `localStorage`, `new Date()`, `Math.random`; os dados: `RealtimeDiceCommands`, `HttpSavedRollsApi`, `createDicePreferencesStore`, o `three-dice-renderer` por `import()` e `createWebAudioDiceSound()`; o `browserWallClock` como `diceClock` e como `wallClock` do `createOpenTablesStore`)
- `src/app/router.tsx` — `buildRoutes(deps)`: rotas do modo data do React Router 8 (abaixo); `AppDependencies` = `{ authApi, campaignsApi, profileApi, accountSecurityApi, userAdminApi, accountLinksApi, libraryApi, sceneActivation, assets, clipboard, isDesktop, desktopWindow, fieldEditing, openTables, sessionStore, railStore, roomLayout, drawingStyle, effectAreaStyle, wallStyle, lightReach, lightColor, auraMotion, createBoardRenderer, boardCommands, pings, dice, chat, chatWindowHost, savedRolls, diceClock, dicePreferences, createDiceRenderer, createDiceSound, interactionClock, now, random, waitBeforeRetry, appUpdate, reloadPage }`, para o teste injetar fakes (os dos dados em [`client/dice.md`](client/dice.md))
- `src/app/route-access.ts` — `decideAccess(session, access, url)`: decisão pura `allow` | `redirect` por `RouteAccess` (`public-only`, `signed-in`, `admin`, `anyone`); `loginPathFor(url)` → `/login?next=…`
- `src/app/title-bar/` — barra de título do app desktop (`TitleBarFrame`, `WindowTitleBar`, slot da sala) e `src/lib/title-bar-target.ts` (`keepOpenOnTitleBar`): ver [`client/title-bar.md`](client/title-bar.md)
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
- App desktop: `src/lib/desktop-shell.ts` (`isDesktopShell`, `desktopShellOf`), `src/services/field-editing.ts` e `src/features/text-field-menu/` — ver [`client/text-field-menu.md`](client/text-field-menu.md); `src/services/desktop-window.ts` — porta `DesktopWindow` (`minimize`, `toggleMaximize`, `close`, `isMaximized`, `onMaximizedChange`) e `TauriDesktopWindow`, o único lugar do `@tauri-apps/api` no client (por `import()`, só na casca; recusa → `DesktopWindowError` com o comando e o motivo) — ver [`client/title-bar.md`](client/title-bar.md)
- `src/lib/stored-choice.ts` — `readStoredChoice(storage, chave, opções, padrão)` / `writeStoredChoice`: preferência de UI no `localStorage` que cai na memória se o storage lança (trilho e painel da sala)
- `src/lib/use-media-query.ts` — `useMediaQuery(query)` e `DESKTOP_QUERY` (`md`); sem `matchMedia` (jsdom) responde `true`
- `src/lib/board-shortcuts.ts`, `ruler-label.ts` — atalhos e régua da sala (ver [`client/board.md`](client/board.md))
- `src/lib/table-roster.ts`, `member-presence.ts`, `idle-watch.ts`, `away-label.ts` — seções, presença, inatividade e "ausente há N min" da aba "Na mesa" (ver [`client/table-people.md`](client/table-people.md))
- `src/lib/cells-text.ts` — `cellsText(1.5)` → `'1,5'`: casas com vírgula
- `src/lib/token-side.ts` — `sideRingVar(lado)` → `var(--label)` / `var(--chart-3)` / `var(--chart-2)`: a cor do anel do token no DOM
- `src/lib/safe-redirect.ts` — `safeRedirectTarget(next)`: só caminho interno; `//x`, `/\x`, URL absoluta, `javascript:`, vazio e `/login` viram `/`
- `src/lib/greeting.ts` — `GREETINGS` (10 saudações) e `greetingFor(nome, sorteio ∈ [0, 1))`; fora do intervalo → `RangeError`
- `src/lib/overline-date.ts` — `formatOverlineDate(data)` → "Quarta, 14 de outubro"
- `src/lib/{campaign-status,content-warnings,campaign-tags,campaign-cover}.ts` — rótulo e tom do status, avisos e sugestões de tag, `addTag`/`removeLastTag`, `fallbackCoverOf(id)` ([`client/campaign-parts.md`](client/campaign-parts.md))
- `src/lib/campaign-code.ts` — `formatCampaignCode('VHRN7K2Q')` → `'VHRN-7K2Q'` e `maskCampaignCode(digitado)` (máscara do campo: só letras e dígitos, caixa alta, até 8, hífen depois do 4º; quem valida continua sendo o DTO)
- `src/lib/search-text.ts` — `searchText('Ossuário')` → `'ossuario'`: o texto de busca sem acento nem caixa (mesas e biblioteca)
- `src/lib/folder-tree.ts` — árvore, árvore filtrada pela busca e `canDrop` da biblioteca; `edited-label.ts` — "editado há 3 dias" (ver [`client/library.md`](client/library.md))
- `src/lib/use-fragment-token.ts` — `useFragmentToken()`: o `token` de `#token=…` lido uma vez e o fragmento tirado da URL (`replace`); páginas de link de uso único
- `src/lib/use-draft-field.ts` — `useDraftField({ confirmed, normalize?, save })`: rascunho × confirmado (ficha, nome do grid)
- `src/lib/{member-since,since-label,two-factor-text,avatar-file,download-text}.ts` — de "Minha conta" ([`client/account.md`](client/account.md))
- `src/lib/campaign-list.ts` — `filterCampaigns(mesas, busca)` (nome ou sistema, sem acento nem caixa) e `continueCandidate(mesas)` (a de `lastEnteredAt` mais recente, ou `null`)
- `src/lib/campaign-meta.ts` — `campaignMeta(mesa, readerId)` ("Tormenta20 · Mestre: Bia · 4 participantes"; o dono só não aparece para ele mesmo — o co-mestre lê; sem o status), `memberCountLabel(n)`, `ROLE_LABEL`
- `src/services/http-transport.ts` — `HttpTransport` (interface; `GET`, `POST`, `PUT`, `PATCH`, `DELETE`; `upload(path, file, 'POST' | 'PUT')`), `FetchHttpTransport` (base `/api`, JSON, `credentials: 'same-origin'`), `NetworkUnavailableError`; resposta com `body` JSON, `null` se vazia, `undefined` se não-JSON
- `src/services/api-call.ts` — o comum a todo serviço: `callApi(transport, método, caminho, corpo?)` → `ok` (status < 300) | `refused` (com a resposta, para o serviço nomear o `kind`) | `offline`; `parseOk(dto, corpo, pick)` (corpo fora do DTO → `unexpected`); `retryAfterOf(resposta)` (`Retry-After`, senão `retryAfterSeconds` do corpo, senão 60); `errorCodeOf(resposta)`
- `src/services/auth-api.ts` — `AuthApi` / `HttpAuthApi` (falhas, `login` e `verifyTwoFactor` em [`auth.md`](auth.md), Client)
- `src/services/{profile-api,account-security-api,account-failure}.ts` — ver [`client/account.md`](client/account.md); `user-admin-api.ts`, `account-links-api.ts` — ver os sub-docs do backoffice e dos links
- `src/services/campaigns-api.ts` — `CampaignsApi` / `HttpCampaignsApi`: `list`, `create`, `detail`, `join`, `enter`, `update`, `regenerateCode`, `remove`, cada um devolvendo `CampaignsResult<T>`; falhas em [`client/campaign-parts.md`](client/campaign-parts.md)
- `src/services/realtime-transport.ts` — `RealtimeTransport` / `SocketIoRealtimeTransport`: o único lugar do `socket.io-client` ([`client/realtime.md`](client/realtime.md))
- `src/services/table-session-api.ts` — `TableSessionApi` / `RealtimeTableSessionApi`: várias mesas sobre um socket, `open(campaignId, listener)` → handle com `close`, `setAway`, `watch`, `followCast` ([`client/realtime.md`](client/realtime.md))
- `src/services/clipboard.ts` — `Clipboard` (interface) e `NavigatorClipboard` (`copy(texto)` → `false` quando o navegador recusa; `readText()` → `null`)
- `src/stores/rail-store.ts` — `createRailStore(storage)` (Zustand vanilla), `useRail(store)`; `rail` = `expanded` (padrão) | `collapsed`, gravado em `localStorage` (`lorkarium.rail`); storage que lança cai na memória
- `src/stores/open-tables-store.ts` — `createOpenTablesStore({ api, storage, createInteraction, wallClock? })`: as mesas abertas da aba (até `MAX_OPEN_TABLES`, no `sessionStorage`), cada uma com presença, tabuleiro, elenco, edição, abas e o histórico de dados ([`client/realtime.md`](client/realtime.md))
- Dados: `src/features/dice/`, `src/lib/dice-*.ts`, `src/services/{dice-commands,saved-rolls-api}.ts`, `src/stores/dice-{history,preferences}-store.ts` e o `browserWallClock` de `src/lib/interaction-clock.ts` ([`client/dice.md`](client/dice.md), [`client/dice-tab.md`](client/dice-tab.md))
- `src/stores/table-presence-store.ts` — `createTablePresenceStore(campaignId)`: quem está na mesa, com a regra de versão ([`client/realtime.md`](client/realtime.md))
- `src/stores/session-store.ts` — `createSessionStore()` (Zustand vanilla), singleton `sessionStore`, hook `useSession(store)`; estado `unknown { reconnecting }` (`serverUnreachable()`) → `authenticated { user }` | `anonymous`

## Rotas

Tabela de caminhos, guardas (`middleware` + `decideAccess`), `restoreOpenTables`, árvore e o `next` do login: [`client/rotas.md`](client/rotas.md). `/api` e `/assets/` são reservados (ver Regras de arquitetura).

## Regras de arquitetura

- Componente shadcn novo entra por `pnpm exec shadcn add <nome> -y` (rodado em `client/`) e é ajustado aos tokens do design system no próprio arquivo (raio de 4px, sem sombra nem blur, rótulos em pt-BR).
- Texto de interface em pt-BR; identificadores em inglês.
- Rede só por `src/services/` sobre `HttpTransport`; serviço devolve falha como valor, a tela só traduz o `kind` em mensagem.
- Dados de tela pelo modo data: lista e detalhe por `loader`, mutação por `action` (o router revalida sozinho); envio sem navegação por `useFetcher`. O Zustand fica para sessão, trilho e (depois) tempo real.
- Em dev, o Vite faz proxy de `/api` para `http://localhost:3333` com `ws: true` (o upgrade do Socket.IO em `/api/socket.io`) e sem `changeOrigin` (o server compara `Origin` com `Host`); o `vite preview` herda o mesmo proxy. Em produção é a mesma origem: o **server** entrega o `client/dist` (`CLIENT_DIST_DIR`, ver `server.md`) — `/assets/*` com `immutable` de um ano, o `index.html` e o resto da raiz com `no-cache`, e qualquer outro `GET` fora de `/api` e `/assets` cai no `index.html` (deep link do React Router). Por isso `/api` e `/assets/` são **reservados**: rota do client com esses prefixos nunca abre. Sem CORS e com cookie first-party.

## Testes

Vitest em `jsdom`, setup, `testDependencies()` e os fakes de `client/test/support/`: [`client/testes.md`](client/testes.md).

## Armadilhas

Em [`client/armadilhas.md`](client/armadilhas.md) (React Router, Radix/shadcn, React Compiler, jsdom, Playwright).
