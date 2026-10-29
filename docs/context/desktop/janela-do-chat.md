# Desktop · janela do chat (a única 2ª janela)

Hub: [`../desktop.md`](../desktop.md). Plano de origem: `docs/plans/2026-10-27-tela-chat-da-mesa.md` (fase 12). O lado do client (botão, portal, "Trazer de volta"): [`../client/chat-janela.md`](../client/chat-janela.md).

O "Abrir em outra janela" do chat faz `window.open('/chat-window.html', 'lorkarium-chat-<campaignId>', 'popup,width=420,height=720')` e o React da janela principal desenha o chat por portal no `document.body` da nova — precisa de `window.opener` e mesma origem. No navegador padrão a página ficaria em branco (sem opener), por isso é a **única** URL que vira janela Tauri; todo outro `window.open` segue `Deny` (ver a tabela do hub).

## Reconhecimento da URL

`new_window_decision` (`navigation.rs`) devolve `Navigation::ChatWindow` quando `AppOrigin::contains(url)` (esquema, host e porta) **e** `url.path() == CHAT_WINDOW_PATH` (`/chat-window.html`, exato e sensível a caixa). Query e hash são livres (o client pode passar a mesa). Viram `OpenExternal`: `/campaigns/chat-window.html`, `/chat-window.html.evil`, `/Chat-Window.html`, `http://` no host do app em release e outro site com o mesmo caminho. A navegação comum (`navigation_decision`) para a página segue `Stay`.

## Criação (`chat_window.rs`)

- `chat_window::open` responde `NewWindowResponse::Create` com uma `WebviewWindow` de rótulo `chat-<n>` (`chat_window_label`, contador do processo: uma 2ª mesa ou a anterior ainda fechando nunca colide).
- `WebviewWindowBuilder` em `about:blank` + `.window_features(features)`: o `tauri-runtime-wry` não carrega o `about:blank` e o WebView2 navega a janela nova ao pedido; o `window_features` traz o `ICoreWebView2Environment` do opener (exigência do `Create` no Windows) e o tamanho/posição do pedido. Sem tamanho no pedido: 420×720; mínimo 320×400.
- Título "Chat · Lorkarium", `Theme::Dark`, fundo `#101216` (o da `main`), `disable_drag_drop_handler` e `zoom_hotkeys_enabled(false)` como na `main`.
- Falha ao criar → `Deny` + stderr: o `window.open` do client devolve `null` e o chat fica na aba (estado "janela bloqueada").
- `webview2::harden_chat`: menu e aceleradores do navegador desligados (F5 recarregaria a página vazia e soltaria o portal), o mesmo UA e o `CLIPBOARD_READ` da origem do app. Sem o retorno à splash (`NavigationCompleted`): a janela do chat nunca mostra a splash.
- Guardas: `navigation_guard` igual à `main`; um `window.open` de dentro dela segue o `new_window_decision`, mas `ChatWindow` vira `Block` (página do chat sem React por trás).
- O X **fecha** (sem `hide_on_close`); o client nota o fechamento e traz o chat de volta à aba. O "Sair" da bandeja encerra tudo.
- O `window-state` só guarda a `main` (`with_filter(main_window::keeps_window_state)`): a do chat abre sempre no tamanho pedido, sem acumular `chat-<n>` no arquivo de estado.

## Moldura: a do sistema

A janela do chat usa a moldura nativa (`decorations` padrão), não a barra própria da `main`. A página dela é só o portal do painel do chat, sem o `TitleBarFrame` ([`../client/title-bar.md`](../client/title-bar.md)), e a capability remota `app-window-controls` (`window_controls.rs`) libera os controles só para a janela `main`. A janela do chat não recebe permissões IPC próprias.

## Sempre por cima

- O client desktop usa `TauriChatWindowHost` (`client/src/services/desktop-chat-window-host.ts`): preserva `window.open` e acrescenta `setAlwaysOnTop(enabled)` ao handle. O navegador comum não fornece essa operação.
- `chat_window.rs` escreve a marca imutável `__LORKARIUM_CHAT_WINDOW_LABEL__` no documento da nova janela por `initialization_script`. O adaptador lê esse rótulo da janela carregada e chama `set_chat_always_on_top` pela IPC da **principal**.
- `chat_window_controls.rs`: capability `chat-window-controls`, só remota na origem do app e só na `main`, libera apenas `allow-set-chat-always-on-top`. O comando aceita a janela alvo só se o emissor é `main`, o rótulo é `chat-<n>` e o alvo está em `/chat-window.html` na mesma origem. Não concede `core:window:allow-set-always-on-top` nem permite fixar a janela principal.
- A chamada resolve depois de `WebviewWindow::set_always_on_top(enabled)` confirmar; erro chega ao checkbox para manter o estado anterior. Cada nova janela começa sem fixação; o `window-state` não guarda essa preferência.

## Testes

`navigation.rs` (9 casos: aceita com e sem query/hash; recusa outro site, http, outra porta, outro caminho, prefixo, outra caixa; navegação comum `Stay`), `chat_window.rs` (rótulo), `chat_window_controls.rs` (emissor, rótulo, origem/caminho e permissão) e `main_window.rs` (`keeps_window_state`). `client/test/services/desktop-chat-window-host.spec.ts` prova o comando de fixar/desfixar, marca inválida, janela fechada e recusa IPC. A borda (`open`, `harden_chat`) não tem teste, como o resto da casca. APIs conferidas no Tauri 2.12.5 e wry 0.57.1 do lock; o [`NewWindowResponse::Create`](https://docs.rs/tauri/2.12.5/tauri/webview/enum.NewWindowResponse.html) exige o mesmo ambiente WebView2 no Windows.

Smoke CDP em 2026-10-28, com os componentes reais `useChatWindow`, `BrowserChatWindowHost` e `ChatWindowPortal`: a 2ª WebView2 expôs `window.opener`, desenhou o portal, copiou estilos e executou callback React na principal por clique na nova janela. Fechá-la retornou `detached → docked`. Os 75 testes Rust, fmt, clippy e build também passaram.

**Pendente (manual):** o envio Socket.IO foi provado no popup Chromium pelo e2e, mas não neste smoke nativo isolado. Na casca, ainda conferir envio para a mesa e F5/menu desligados: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333 pnpm desktop:dev`, CDP em `http://localhost:9333/json`.

## Armadilhas

- **`Create` exige o mesmo ambiente WebView2 e a janela sem navegação**: sem `window_features(features)` (o `environment` do opener) ou com uma URL real no builder, o `SetNewWindow` falha e o `window.open` não devolve a janela. Por isso `about:blank`.
- Criar a janela dentro do `on_new_window` não trava: o wry 0.57 adia o handler (`GetDeferral` + `dispatch_handler`) para depois do callback COM, e a criação na thread principal é feita direto (sem canal).
