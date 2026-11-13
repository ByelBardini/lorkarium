# Client · atalhos da sala

Índice: [`../client.md`](../client.md) · sala: [`board.md`](board.md). O que cada tecla faz na sala de jogo e no tabuleiro; a decisão por tecla mora em `src/lib/board-shortcuts.ts` (`shortcutFor`, `editShortcutFor`, `homeShortcutFor`, `tabShortcutFor`) e o ouvinte em `src/features/board/use-room-shortcuts.ts`.

| Tecla             | Onde                | Faz                                                                                              |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| F                 | sala                | liga/desliga o modo foco                                                                         |
| Esc               | sala / arrastando   | sai do foco, limpa a régua, cancela o arraste                                                    |
| V / R / B / M / G | sala                | Selecionar / Régua / Desenhar / Área de efeito / grid local                                      |
| T                 | sala, até modo foco | abre a gaveta do chat e foca o compositor (também já aberta)                                     |
| Esc               | gaveta do chat      | fecha só a gaveta (não sai do foco); sugestão/menu aberto fecha antes                            |
| 1 / 2 / 3         | sala (mestre)       | camada ativa: Tokens / Objetos / Fundo                                                           |
| P                 | sala (mestre)       | Paredes ([`walls.md`](walls.md))                                                                 |
| ⇧M / ⇧F           | sala, até documento | mapa principal / sua ficha; já nela, volta à aba de antes ([`library-maps.md`](library-maps.md)) |
| ⇧B                | sala                | abre/fecha a Biblioteca (B sozinho continua Desenhar)                                            |
| \                 | sala                | abre/recolhe o painel lateral                                                                    |
| Ctrl+Tab / ⇧Tab   | sala, só no desktop | próxima / aba anterior (circular, na ordem da faixa: `tabOrder`)                                 |
| Ctrl+1 … 9        | sala, só no desktop | a N-ésima aba (sem ela, nada)                                                                    |
| Ctrl+W            | sala, só no desktop | fecha a aba visível (a do grupo não fecha)                                                       |
| Ctrl/⌘+⇧+← / →    | aba focada da faixa | move a aba uma casa (nunca antes do grupo; o grupo não se move) ([`grid-tabs.md`](grid-tabs.md)) |
| + = / − / 0       | tabuleiro focado    | aproxima / afasta / enquadra                                                                     |
| W A S D           | tabuleiro focado    | move a câmera                                                                                    |
| Q / E             | tabuleiro focado    | gira a seleção −45° / +45°                                                                       |
| Arrastar a alça   | token selecionado   | gira o token (Shift encaixa em 45°)                                                              |
| Arrastar quadrado | token selecionado   | lateral estica um eixo; canto escala mantendo a proporção; Esc solta                             |
| Arrastar alça     | área selecionada    | Quadrado estica; as outras mudam o raio; cone/semicírculo/linha giram                            |
| Arrastar alça     | luz em cone pega    | mira o holofote (ferramenta Luzes; Shift 45°; [`cones.md`](cones.md))                            |
| Roda / Ctrl+roda  | sobre o tabuleiro   | move / aproxima no cursor                                                                        |
| Botão direito     | arrastado no canvas | move a câmera                                                                                    |
| Botão direito     | clique sobre token  | condição, morto, imagem, borda, inverter (quem controla); camada (mestre)                        |
| Clique / direito  | ícone de porta      | abre/fecha (quem vê); menu Abrir/Fechar/Trancar (mestre)                                         |
| Arrastar no vazio | Selecionar          | retângulo de seleção (Shift soma)                                                                |
| Shift+clique      | token ou desenho    | soma/tira da seleção                                                                             |
| Delete / ⌫        | tabuleiro focado    | apaga desenhos, áreas e paredes; tokens em `token-rights.md`                                     |
| Ctrl/⌘ + C / V    | sala                | copia a seleção / cola sob o cursor                                                              |
| Ctrl/⌘ + Z        | sala                | desfaz a última ação sua                                                                         |
| Ctrl/⌘ + Y, ⇧Z    | sala                | refaz                                                                                            |
| Enter / ⌫ / Esc   | editor da patrulha  | salva / tira o último ponto / cancela ([`token-patrols.md`](token-patrols.md))                   |

Ignorados em campo, `contenteditable`, diálogo/menu, dentro da gaveta da biblioteca e com Ctrl/⌘/Alt (`src/lib/board-shortcuts.ts`); ⇧M/⇧F não viram M/F. O painel é `\` e não `]`: `[`/`]` já andam a seleção entre tokens (`src/lib/board-keys.ts`). ⇧B é o `toggle-library` (`useRoomShortcuts({ toggleLibrary })`, pelo `useLibraryToggle`); `\` é o `toggle-panel` (`togglePanel` da `room-layout-store`). Dentro da gaveta da biblioteca (`[data-owns-room-keys]`, `OWNS_ROOM_KEYS_ATTRIBUTE`) nenhuma tecla da sala, de casa, de edição ou de aba vale, para a árvore e os campos ficarem com as suas; só o ⇧B fora de campo passa, e fecha a biblioteca. Ctrl/⌘+⇧+←/→ é da tablist (`onKeyDown` dela, não da janela): o `tabShortcutFor` recusa Shift fora do Tab e o `shortcutFor` recusa Ctrl, sem conflito; a seta sozinha continua andando o foco. Na árvore dela, Enter num item (não pasta) o abre numa aba da sala, como o duplo clique; Espaço só escolhe ([`library.md`](library.md)). Edição (`editShortcutFor`): Ctrl/⌘, sem Alt. Abas (`tabShortcutFor` → `next-tab`, `previous-tab`, `{ nth }`, `close-tab`): só Ctrl (nem ⌘ nem Alt; Shift só no Tab) e **só no app desktop**: no navegador o Chromium não deixa a página segurar Ctrl+Tab/Ctrl+W, então lá a aba é no clique. A decisão da tecla é pura; quem liga o ouvinte só na casca (`isDesktopShell`) é a sala, por `useTabShortcuts` (`src/features/board/use-tab-shortcuts.ts`): junta grids (`scene-tabs-store`) e itens do workspace na ordem vista (`roomTabOrder` sobre o `tabOrder`; homes fora), mostra por `showRoomTab` e fecha grid pela store ou item pelo `close` do workspace (que pergunta o rascunho pendente; recusado, nada fecha); fechado, mostra a aba anterior na ordem. Em qualquer casa mantém o `previousKey` da store (`noteShown`) para o ⇧M/⇧F voltar.

O `T` só conta um pedido (`requestChatFocus` → `chatFocusRequest` na `room-layout-store`, ouvido por `onChatFocusRequest`) e cancela o `keydown`, senão a letra cairia no compositor que acabou de ganhar o foco. Quem decide é o chat: o `ChatDock` abre a gaveta só com o chat no rodapé, e a `ChatDrawer` refoca o compositor a cada pedido. Com o chat em outra janela, ou no celular (sem barra), `T` não faz nada e não grava a gaveta como aberta. O `Esc` da gaveta para no `onKeyDown` dela (`stopPropagation`): os atalhos da sala ouvem na `window`.
