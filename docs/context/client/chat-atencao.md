# Client · brilho do ícone na barra de tarefas

Índice: [`../client.md`](../client.md) · chat: [`chat.md`](chat.md) · casca: [`../desktop.md`](../desktop.md) (Segurança).

Só no app desktop: mensagem de chat que a pessoa não pode ver acende o botão do Lorkarium na barra de tarefas do Windows (`FlashWindowEx`); ir aonde o chat aparece apaga. No navegador nada acontece (`chatAttention` nulo).

## Regra (`src/lib/chat-attention.ts`, pura)

`ChatAttentionTracker` guarda uma marca **pendente por mesa aberta**. `ChatAttentionView` = `{ focused, roomCampaignId }`: alguma janela do app em primeiro plano e a mesa cuja sala está na tela (`null` fora da sala). Cada método devolve `TaskbarCommand` (`'flash'` | `'stop'` | `null`).

- `messageArrived(mesa, view)`: **toda mensagem de outra pessoa** (Mesa, privado, grupo; com ou sem menção) marca pendente, salvo com o app na frente **e** a sala daquela mesa na tela. App fora da frente → `flash`; na frente fora da sala → só pendente (o Windows não pisca a janela ativa).
- `viewChanged(view)`: app saiu da frente com algo pendente → `flash` (de novo a cada saída); na frente e na sala de uma mesa pendente → apaga a marca dela e, sem outra, `stop`. Focar a janela fora da sala não apaga (o Windows apaga o brilho sozinho ao focar; a próxima saída acende outra vez).
- `keepOnly(abertas)`: mesa fechada perde a marca; a última → `stop`.
- "Na sala" vale com a gaveta aberta ou não (a barra está à vista), no celular e com o chat destacado. A sala coberta por Configurações/Condições **não** conta (`onScreen` falso).

## Peças

- `src/services/taskbar-attention.ts` — a porta `TaskbarAttention` (`request()`, `stop()`) e `TauriTaskbarAttention`: `getCurrentWindow().requestUserAttention(UserAttentionType.Informational)` / `(null)`, `@tauri-apps/api/window` por `import()`. No tao 0.37 o `Informational` é `FLASHW_TRAY` com 4 piscadas e o botão fica aceso até a janela vir à frente. Recusa da IPC (casca sem a permissão) é engolida: o chat segue igual, sem brilho.
- `src/features/chat/chat-attention-watch.ts` — `ChatAttention` (`messageArrived`, `showRoom(mesa, janelaDoChat) → sair`, `keepOnly`) e `ChatAttentionWatch(taskbar, janelaPrincipal, defer)`: "na frente" = `document.hasFocus()` da principal **ou** da janela destacada do chat da sala (`FocusWindow`, fechada não conta). Ouve `focus`/`blur` das duas e lê o foco depois do `defer` (`setTimeout` 0): trocar de uma para a outra tira o foco da primeira antes de dar à segunda. Sair de uma sala antiga depois de outra entrar não apaga a nova.
- `src/features/chat/use-chat-attention.ts` — `useChatAttention(openTables, attention, viewerId)` no `ShellRoute` (`router.tsx`): assina o `onNewMessage` de cada mesa aberta (pela store do chat, não pelo id: mesa reaberta vem com outra) e repassa a mensagem de outra pessoa; a cada mudança das mesas, `keepOnly`. `useRoomAttention(attention, mesa, janela)` no `RoomChat`, com `attention` só quando `onScreen` (`!covered` da `PlayRoomPage`); a janela vem do `useRoomChatWindow` (`focusWindow`, o `defaultView` do alvo do portal).
- `AppDependencies.chatAttention: ChatAttention | null` — `ChatAttentionWatch(new TauriTaskbarAttention(), window)` na casca com `LorkariumTitleBar/1` (`main.tsx`); `null` no navegador e no `testDependencies()`.

## Testes

`test/lib/chat-attention.spec.ts` (a regra: app atrás, sala na frente, fora da sala, outra mesa, voltar sem ver, duas mesas, fechar); `test/services/taskbar-attention.spec.ts` (`mockIPC`: `plugin:window|request_user_attention` na `main` com `{ type: 'Informational' }` e `null`; recusa engolida); `test/features/chat/chat-attention-watch.spec.ts` (`TaskbarAttentionFake`, `FocusWindowFake` em `test/support/chat-attention-fakes.ts`: foco movido à mão, `defer` rodado pelo teste; janela destacada, fechada, saída tardia); `test/features/chat/use-chat-attention.spec.tsx` (`ChatAttentionFake`: só mensagem alheia, mesa aberta depois, fechar, desmontar, navegador; o `RoomChat` coberto não se mostra). Na casca real não há teste automático: conferir pelo `pnpm desktop:dev` (receber de outra conta com a janela atrás e em Configurações).
