# Desktop · janelas auxiliares de Chat, Dados e Imagens

Hub: [`../desktop.md`](../desktop.md). O lado do client (botão, portal, "Trazer de volta"): [`../client/chat-janela.md`](../client/chat-janela.md).

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

## Moldura e controles próprios

As janelas auxiliares usam `decorations(false)` e a marca imutável `__LORKARIUM_DETACHED_TITLE_BAR__`. O client desenha `DetachedWindowFrame`, com região CSS de arraste e Minimizar/Maximizar/Restaurar/Fechar. O mesmo `/chat-window.html` serve Dados por `?panel=dice`; nomes distintos no client permitem chat e dados simultâneos, cada um com seu rótulo `chat-<n>` na casca. A guarda de caminho/origem segue exata.

`control_detached_window` recebe o rótulo e uma ação desserializada (`close`, `minimize`, `toggle-maximize`, `is-maximized`); usa a mesma validação de emissor `main`, rótulo e origem/caminho de `chat_control_allowed`. A capability remota `chat-window-controls` acrescenta apenas `allow-control-detached-window`. A própria janela auxiliar não recebe IPC; o React na principal invoca a operação. Fechar usa `WebviewWindow::close`, tanto pelo X do topo quanto por “Trazer de volta” e ao sair da sala. O `window-state` continua restrito à principal.

## Sempre por cima

- O client desktop usa `TauriChatWindowHost` (`client/src/services/desktop-chat-window-host.ts`): preserva `window.open` e acrescenta `setAlwaysOnTop(enabled)` ao handle. O navegador comum não fornece essa operação.
- `chat_window.rs` escreve a marca imutável `__LORKARIUM_CHAT_WINDOW_LABEL__` no documento da nova janela por `initialization_script`. O adaptador lê esse rótulo da janela carregada e chama `set_chat_always_on_top` pela IPC da **principal**.
- `chat_window_controls.rs`: capability `chat-window-controls`, só remota na origem do app e só na `main`, libera `allow-set-chat-always-on-top` e `allow-control-detached-window`. Os comandos aceitam a janela alvo só se o emissor é `main`, o rótulo é `chat-<n>` e o alvo está em `/chat-window.html` na mesma origem. Não concede `core:window:allow-set-always-on-top` nem permite fixar a janela principal.
- A chamada resolve depois de `WebviewWindow::set_always_on_top(enabled)` confirmar; erro chega ao checkbox para manter o estado anterior. Cada nova janela começa sem fixação; o `window-state` não guarda essa preferência.

## Testes

`navigation.rs` cobre origem e caminho exatos, query/hash e navegação comum `Stay`; `chat_window.rs`, o rótulo; `chat_window_controls.rs`, emissor, rótulo, origem/caminho, permissões, ações aceitas/recusadas e a query de Dados; `main_window.rs`, `keeps_window_state`. `client/test/services/desktop-chat-window-host.spec.ts` cobre fixar/desfixar, marca inválida, janela fechada, recusa IPC e os controles nativos sem `Window.close()`. A borda (`open`, `harden_chat`) não tem teste automático; o fluxo Socket.IO com janelas simultâneas está no Chromium em `e2e/test/dice.spec.ts`. Conferência manual da casca: CDP descrito no hub.

## Armadilhas

- **Fechar pelo JavaScript do WebView2 pode deixar a casca vazia.** O `window.close()` passa pelo `WindowCloseRequested` do wry, que chama `DestroyWindow` no HWND do container da WebView diretamente. Nas janelas auxiliares da casca nova, usar o comando nativo `close` (com as mesmas guardas de alvo), nunca o `Window.close` do navegador. O adaptador marca o handle fechado após a confirmação da IPC e compartilha a promessa de fechamento entre chamadas concorrentes. “Trazer de volta” só desmonta o portal depois da confirmação; recusa mantém o conteúdo na janela para tentar de novo.

- **`Create` exige o mesmo ambiente WebView2 e a janela sem navegação**: sem `window_features(features)` (o `environment` do opener) ou com uma URL real no builder, o `SetNewWindow` falha e o `window.open` não devolve a janela. Por isso `about:blank`.
- Criar a janela dentro do `on_new_window` não trava: o wry 0.57 adia o handler (`GetDeferral` + `dispatch_handler`) para depois do callback COM, e a criação na thread principal é feita direto (sem canal).

## Terceiro painel: imagem apresentada

A principal instala a marca imutável `__LORKARIUM_IMAGE_WINDOW_SUPPORTED__` por `initialization_script`. O client só tenta abertura automática com marca verdadeira e casca desktop; nova release da casca habilita o caminho. Casca anterior mantém modal funcional.

`?panel=image` reaproveita caminho/origem, ambiente WebView2 e rótulos `chat-<n>`. Nome do client: `lorkarium-image-<campaignId>`; tamanho 960×720. Nenhuma permissão IPC ou allowlist adicional. Substituir mantém janela e troca portal; X fecha só a apresentação local. Controles nativos existentes minimizam/maximizam/fecham. Falha de abertura/documento retorna ao modal; recusa de fechamento mantém conteúdo e aviso.
