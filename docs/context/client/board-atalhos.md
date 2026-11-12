# Client · atalhos da sala

Índice: [`../client.md`](../client.md) · sala: [`board.md`](board.md). O que cada tecla faz na sala de jogo e no tabuleiro; a decisão por tecla mora em `src/lib/board-shortcuts.ts` (`shortcutFor`, `editShortcutFor`) e o ouvinte em `src/features/board/use-room-shortcuts.ts`.

| Tecla             | Onde                | Faz                                                                            |
| ----------------- | ------------------- | ------------------------------------------------------------------------------ |
| F                 | sala                | liga/desliga o modo foco                                                       |
| Esc               | sala / arrastando   | sai do foco, limpa a régua, cancela o arraste                                  |
| V / R / B / M / G | sala                | Selecionar / Régua / Desenhar / Área de efeito / grid local                    |
| 1 / 2 / 3         | sala (mestre)       | camada ativa: Tokens / Objetos / Fundo                                         |
| P                 | sala (mestre)       | Paredes ([`walls.md`](walls.md))                                               |
| ⇧M / ⇧F           | sala, até documento | mapa principal / sua ficha principal ([`library-maps.md`](library-maps.md))    |
| + = / − / 0       | tabuleiro focado    | aproxima / afasta / enquadra                                                   |
| W A S D           | tabuleiro focado    | move a câmera                                                                  |
| Q / E             | tabuleiro focado    | gira a seleção −45° / +45°                                                     |
| Arrastar a alça   | token selecionado   | gira o token (Shift encaixa em 45°)                                            |
| Arrastar quadrado | token selecionado   | lateral estica um eixo; canto escala mantendo a proporção; Esc solta           |
| Arrastar alça     | área selecionada    | Quadrado estica; as outras mudam o raio; cone/semicírculo/linha giram          |
| Arrastar alça     | luz em cone pega    | mira o holofote (ferramenta Luzes; Shift 45°; [`cones.md`](cones.md))          |
| Roda / Ctrl+roda  | sobre o tabuleiro   | move / aproxima no cursor                                                      |
| Botão direito     | arrastado no canvas | move a câmera                                                                  |
| Botão direito     | clique sobre token  | condição, morto, imagem, borda, inverter (quem controla); camada (mestre)      |
| Clique / direito  | ícone de porta      | abre/fecha (quem vê); menu Abrir/Fechar/Trancar (mestre)                       |
| Arrastar no vazio | Selecionar          | retângulo de seleção (Shift soma)                                              |
| Shift+clique      | token ou desenho    | soma/tira da seleção                                                           |
| Delete / ⌫        | tabuleiro focado    | apaga desenhos, áreas e paredes; tokens em `token-rights.md`                   |
| Ctrl/⌘ + C / V    | sala                | copia a seleção / cola sob o cursor                                            |
| Ctrl/⌘ + Z        | sala                | desfaz a última ação sua                                                       |
| Ctrl/⌘ + Y, ⇧Z    | sala                | refaz                                                                          |
| Enter / ⌫ / Esc   | editor da patrulha  | salva / tira o último ponto / cancela ([`token-patrols.md`](token-patrols.md)) |

Ignorados em campo, `contenteditable`, diálogo/menu e com Ctrl/⌘/Alt (`src/lib/board-shortcuts.ts`); ⇧M/⇧F não viram M/F. Edição (`editShortcutFor`): Ctrl/⌘, sem Alt.
