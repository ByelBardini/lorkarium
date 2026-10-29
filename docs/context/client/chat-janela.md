# Client · chat em outra janela

Índice: [`../client.md`](../client.md) · chat: [`chat.md`](chat.md) · lado da casca desktop: [`../desktop/janela-do-chat.md`](../desktop/janela-do-chat.md). Plano: `docs/plans/2026-10-27-tela-chat-da-mesa.md` (fase 11).

"Abrir em outra janela" abre uma **janela do sistema** (não aba) e o React da janela principal desenha o chat **por portal** no `document.body` dela: mesma conexão, mesmas stores, nenhum segundo boot. A janela nova não roda código próprio.

## Peças

- `public/chat-window.html` — página vazia da mesma origem: `<title>Chat · Lorkarium</title>`, fundo `#101216` (o `--background`), `<body data-lorkarium-chat-window>`. A marca no `body` é o sinal de que a página carregou (o `about:blank` inicial da janela nova não a tem).
- `src/services/chat-window-host.ts` — a porta: `ChatWindowHost.open(url, name, features) → ChatWindowHandle | null` (`ChatWindowHandle` = `{ closed, document, close(), focus() }`, um `Window` real cabe); `BrowserChatWindowHost(window)` sobre `window.open` (mantém o `window.opener`); `CHAT_WINDOW_URL` (`/chat-window.html`, o mesmo caminho que a casca Tauri aceita), `CHAT_WINDOW_FEATURES` (`popup,width=420,height=720`), `CHAT_WINDOW_MARK`.
- `AppDependencies.chatWindowHost` — `BrowserChatWindowHost(window)` no `main.tsx`; `ChatWindowHostFake` no `testDependencies()`.
- `src/features/chat/use-chat-window.ts` — `useChatWindow(campaignId, host) → { status, open, bringBack, portalTarget }`:
  - `status`: `'docked'` (chat na aba) | `'detached'` (em outra janela) | `'blocked'` (o navegador recusou: `open` devolveu `null`; o chat fica na aba com aviso, e `open()` pode tentar de novo).
  - `open()`: abre com o nome `lorkarium-chat-<campaignId>` (`chatWindowNameOf`); com a janela ainda aberta, **só foca** (chamar `window.open` de novo com o mesmo nome recarregaria a página e soltaria o portal).
  - `bringBack()` ("Trazer de volta"): fecha a janela e volta a `'docked'` na hora.
  - `portalTarget`: o `body` marcado da janela, ou `null` enquanto a página não carregou (e fora de `'detached'`). Uma página recarregada na janela vira o alvo novo.
  - Acompanha a janela a cada `CHAT_WINDOW_POLL_MS` (250 ms) só enquanto `'detached'`: fechada pelo X → `'docked'`; página carregada → `portalTarget`. Não há evento confiável para isso no opener (o `about:blank` inicial e a página que o troca dividem o mesmo `Window`).
  - Sair da sala (unmount) **e** `pagehide` da janela principal (F5, fechar a aba) fecham a janela: sem o React por trás ela seria uma página em branco.
- `src/features/chat/chat-window-portal.tsx` — `<ChatWindowPortal target>{children}</ChatWindowPortal>`: `createPortal` no `target`, `mirrorStyles(document, target.ownerDocument)` enquanto montado, `recognizeNodesOfOtherWindows(window)` e o `PortalWindowContext` com `{ container: target, view: target.ownerDocument.defaultView }`.
- `src/lib/portal-window.ts` — `PortalWindowContext` (`null` = janela principal), `usePortalContainer()` (o `container` dos portais Radix; `undefined` = o padrão do Radix, `document.body` principal) e `useMediaQueryView()` (a janela que o `matchMedia` pergunta). O `useMediaQuery` (`src/lib/use-media-query.ts`) lê o `useMediaQueryView()`: dentro do portal, `DESKTOP_QUERY` responde pela largura da janela do chat (420 px → `false`).
- `src/lib/mirror-styles.ts` — `mirrorStyles(origem, destino) → parar`: clona todo `link[rel=stylesheet]` e `<style>` do `head` da origem (marcados `data-mirrored-style`) e refaz a cópia a cada mudança (`MutationObserver` com `childList`, `subtree`, `characterData`: o CSS de um chunk carregado depois e o `<style>` do Vite reescrito pelo HMR). Parar remove só as cópias; os estilos da própria página ficam.
- `src/lib/cross-window-nodes.ts` — `recognizeNodesOfOtherWindows(window)`: ver Armadilhas.
- `src/components/ui/{dialog,alert-dialog,sheet,dropdown-menu,context-menu,popover,tooltip}.tsx` — todo `*Primitive.Portal` recebe `container={usePortalContainer()}` por padrão (nos wrappers `*Portal` exportados, um `container` passado por prop ganha). Fora do portal nada muda.

## Integração na sala

Dados também abre em janela própria: `useRoomDiceWindow` usa o mesmo host, portal e ciclo de vida (`useChatWindow(campaignId, host, 'dice')`), com `/chat-window.html?panel=dice` e nome `lorkarium-dice-<campaignId>`. Chat e Dados podem ficar abertos ao mesmo tempo, inclusive ao trocar a aba da sala, recolher o painel ou entrar no modo foco. O histórico e os comandos continuam nas mesmas stores e conexão da sala. Fechar pelo X ou usar “Trazer de volta” devolve o painel à sala.

`DetachedWindowFrame` desenha o topo compartilhado (marca, nome do painel e, na casca nova, controles Minimizar/Maximizar/Fechar) e a opção “Sempre por cima”. O título e `--title-bar-height` são definidos no documento do popup, para os portais de diálogos respeitarem o topo. `ChatWindowHandle.desktopWindow` só existe com a marca nativa `__LORKARIUM_DETACHED_TITLE_BAR__`; a casca anterior conserva a moldura do sistema. `DetachedDesktopWindow` executa os controles pela IPC da principal, com o rótulo da janela auxiliar, e segue o resize do popup para o ícone Maximizar/Restaurar.

`ChatWindowHandle.close()` pode devolver uma promessa na casca nova. “Trazer de volta” mantém o portal montado enquanto ela não resolve; rejeição conserva o painel na janela. O adaptador usa o comando nativo `close`, compartilha o fechamento em andamento e marca seu handle fechado ao confirmar. O X do topo usa a mesma operação; o polling nota o fechamento e devolve o painel. O navegador continua com `Window.close()` síncrono.

`use-room-chat-window.tsx` liga o ciclo da janela ao `PlayRoomPage`, que recebe `chatWindowHost` pela rota da campanha. O hook monta `ChatPanel` no `ChatWindowPortal` e fornece o slot docked/detached ao `RoomSidePanel`. Assim a janela continua viva ao trocar a aba do painel, recolhê-lo ou ativar o modo foco. A conversa mostrada na janela fica ativa na mesma store: mensagens vistas ali não aumentam o contador da sala; as outras conversas continuam contando normalmente.

O painel na sala mostra "Chat aberto em outra janela · Trazer de volta"; ao trazer de volta, a janela fecha e a aba monta o chat com o mesmo histórico. Bloqueio do navegador mantém o chat na aba com aviso. A janela fecha ao sair da sala ou no `pagehide` da principal.

O caso integrado em `test/features/board/play-room-page-tabs.spec.tsx` prova envio e recebimento pelo portal, troca para a aba Dados sem fechar a janela, não lidas e retorno à aba. O hook precisa morar na sala, pois montá-lo na aba ou no painel recolhível fecharia a janela ao ocultar esses componentes.

## Spike (2026-10-27, pane do navegador do app)

- O pane **não abre popup**: `window.open(…, 'popup,…')` navegou a própria aba para `/chat-window.html` (a página da sala sumiu). A conferência foi feita com um `<iframe>` de 420×720 como "outra janela" (outro documento e outro realm, como o popup); o popup real fica para a fase 12/13 (Tauri pela CDP 9333, e2e).
- Confirmado no iframe: os estilos copiados aplicam (o `<style>` do Vite em dev; acrescentar e reescrever um `<style>` na principal chega à cópia); `useMediaQuery(DESKTOP_QUERY)` dá `false` dentro (420 px); `Popover`, `DropdownMenu`, `Dialog` e `Tooltip` do `ui/` montam o conteúdo no `body` da outra janela, e um `PopoverPrimitive.Portal` cru (sem `container`) monta na principal; teclado (Enter/setas/Esc no menu, Esc no diálogo, `onKeyDown` de campo) e clique real funcionam pelo portal (o React escuta o container do portal).
- **Clique fora** não fechava menu, popover nem diálogo: ver Armadilhas. Com `recognizeNodesOfOtherWindows`, clique real fora fecha o menu e clique no fundo fecha o diálogo.
- Lido no código do Radix e **não verificado**: o `FocusScope` (diálogo) lê o `document.activeElement` global; a volta do Tab no fim do diálogo e a retenção do foco não valem na janela do chat (o foco inicial e o retorno ao gatilho pelo Esc funcionaram).

## Testes

`test/features/chat/detached-window-frame.spec.tsx` cobre o título no documento correto, offset dos diálogos e os três controles nativos (inclusive Restaurar). O caso integrado de Chat e Dados em `play-room-page-tabs.spec.tsx` cobre janelas simultâneas, rolagem pela janela de Dados após trocar a aba da sala e retorno pelo X sem fechar o chat. `e2e/test/dice.spec.ts` prova o mesmo fluxo com popups Chromium reais e total sincronizado com outro participante via servidor.

Validação real em 2026-10-28: o e2e `chat.spec.ts` passou com popup Chromium, envio público/privado, diálogo dentro da janela, troca de aba na sala e retorno pelo X. O smoke CDP no WebView2, com `useChatWindow`, `BrowserChatWindowHost` e `ChatWindowPortal` reais, confirmou `window.opener`, portal React, cópia de estilos, clique chamando callback na principal e `detached → docked` ao fechar; esse smoke isolado não usou Socket.IO.

`test/features/chat/use-chat-window.spec.tsx` (abrir, página carregada, bloqueado, X, "Trazer de volta", unmount, `pagehide`, reabrir só foca, reabrir depois do X, página recarregada) com `ChatWindowHostFake`/`ChatWindowFake` (`test/support/chat-window-host-fake.ts`: `calls`, `windows`, `last()`, `load()`, `closeByUser()`, `focuses`, `closes`; `new ChatWindowHostFake(true)` bloqueia); `test/features/chat/chat-window-portal.spec.tsx` (iframe do jsdom como janela: filhos no `body` dela, estilos copiados e removidos, popover dentro, media query da janela certa, `instanceof Node`); `test/lib/{mirror-styles,cross-window-nodes}.spec.ts`; `test/services/chat-window-host.spec.ts`.

## Armadilhas

- **`instanceof` entre janelas.** Cada janela é um realm: um nó da janela do chat não é `instanceof Node` da principal. O `DismissableLayer` do Radix (1.2.1) só trata o clique fora se `target instanceof Node`; sem a correção, nada no chat destacado fecha clicando fora. `recognizeNodesOfOtherWindows(window)` define `Node[Symbol.hasInstance]` da principal (herdado por `Element`, `HTMLInputElement`…) para aceitar o nó de outra janela pela interface **de mesmo nome** da janela dele; a resposta para nós da própria principal não muda. É permanente e idempotente, aplicado ao montar o `ChatWindowPortal`.
- `window.open` com o mesmo nome numa janela já aberta **navega** ela de novo (portal solto): por isso o `open()` só foca.
- O `ChatWindowPortal` precisa de `target.ownerDocument` com o `head` da página do chat; portal no `about:blank` inicial seria perdido quando a página carrega. Por isso o alvo só sai depois da marca no `body`.
