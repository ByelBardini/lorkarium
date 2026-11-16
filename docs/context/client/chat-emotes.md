# Client · memes e smileys

Índice: [`../client.md`](../client.md) · chat: [`chat.md`](chat.md) · amigos: [`../friends.md`](../friends.md).

O texto enviado **não muda**: o server recebe e repassa `:troll:` ou `:)` como qualquer texto (nada no contrato nem no `chat:send`/`dm:send`). A troca por imagem é só na hora de desenhar, no client.

## Catálogo (`src/lib/emote-catalog.ts`)

- `Emote` = `{ id, kind: 'smiley' | 'meme', codes, keywords }`. `id` é o nome do arquivo (`src/emotes/images/<id>.png`); o **primeiro código** é o que o seletor insere; `keywords` (pt-BR, sem acento) são para a busca.
- `SMILEYS` (25), `MEMES` (22), `EMOTES` (os dois, smileys antes). Sem estrela (`:gold:`), por escolha do usuário: o spec do catálogo garante.
- Todo emote tem um código `:nome:` (os smileys ganharam `:smile:`, `:sad:`, `:cool:`…), para a lista do `:` oferecer todos. `isNamedEmoteCode(code)` diz se é `:nome:`.
- Nenhum código repete entre emotes (o `:nome:` comparado sem caixa): o spec do catálogo garante.

## Troca (`src/lib/emote-text.ts`)

- `emotePiecesOf(text)` → `EmotePiece[]` (`{ kind: 'text', text }` | `{ kind: 'emote', emote, code }`, `code` como foi digitado). O código mais longo ganha (`:-D`, nunca `:-` + `D`); índice por primeiro caractere, montado uma vez.
- Só vale **solto**: antes, início ou espaço; depois, fim, espaço ou `.,!?;`. Por isso `10:30`, `http://`, `a:b`, `oi:)` e `:D:D` ficam texto.
- `:nome:` casa sem caixa (`:Troll:`); smiley de texto só como escrito (`xd` não é `xD`).
- `emotesOnly(pieces)` → só imagens e espaços: a mensagem vira "figurinha" (40 px).

## Desenho

- `src/components/emote-text.tsx` — `EmoteText({ text })` (o texto com as imagens no lugar) e `EmoteImage({ emote, code, sticker })`. Tamanho em `em`: smiley `1.375em`, meme `1.75em` (acompanham a fala de personagem em 17 px), figurinha `size-10`. `alt` e `title` = o código (leitor de tela e hover).
- Usado em `chat-message-row.tsx` (feed da mesa: Mesa, sussurro, privado, grupo, fala de token) e em `features/friends/conversation-feed.tsx` (DMs). A prévia, a barra, o aviso e o anunciador continuam com o texto cru (`chatLineOf`).
- `src/emotes/emote-images.ts` — `emoteImageUrlOf(id)` pelo `import.meta.glob('./images/*.png', { eager, query: '?url' })`: cada PNG vira `assets/<id>-<hash>.png` (cache imutável), e só baixa quando aparece numa mensagem. Id sem arquivo → erro com o id e o caminho esperado.

## Imagens (`src/emotes/images/`, 47 PNG, 96 px, ~410 KB no total)

- **Smileys:** Noto Emoji (Google, Apache 2.0), `png/128` da tag `v2.047`, reduzidos para 96 px. Escolha do usuário entre Fluent 3D, Noto e Twemoji: não trocar sem perguntar.
- **Memes e o Pac-Man (`:v`):** do pacote do Firecast (`resource.zip`, pasta `smileys/`, 128 px → 96 px), a pedido do usuário. **Sem licença conferida**: os rage faces não têm dono claro e o pacote é de outro produto. Trocar antes de qualquer uso comercial que dependa disso. O Noto não tem Pac-Man.
- Refazer: redimensionar para 96×96 com bicúbico e fundo transparente; o nome do arquivo é o `id` do catálogo.

## Inserir (`src/lib/emote-input.ts`)

- **Lista do `:`** — `suggestionQueryOf` (`chat-suggestions.ts`) devolve `{ kind: 'emote' }` para `:` + 2 caracteres no começo de uma palavra (um `:` sozinho, `:)` ou `10:30` não abrem). `suggestEmotes(typed)` acha pelo `:nome:` ou pela palavra-chave (sem acento nem caixa), na ordem do catálogo, até `EMOTE_SUGGESTION_LIMIT` (8); mostra o `:nome:` que casou ou, por palavra-chave, o primeiro `:nome:`. A linha (`ComposerSuggestion.emote`) desenha a miniatura decorativa (`alt=""`); aceitar escreve o código e um espaço.
- **Botão "Memes e smileys"** — `src/components/emote-picker.tsx` (`EmotePicker({ onPick, disabled })`): popover para cima com busca (`searchEmotes`, em qualquer código ou palavra-chave, nas duas listas) e abas Smileys/Memes; cada célula é um botão com o **primeiro código** como nome. O clique fecha e chama `onPick`; `withEmoteCode(draft, caret, code)` escreve no cursor (espaço antes se colado numa palavra, um depois) e o campo pega o foco de volta.
- **Os dois campos** usam `useComposerField(ref, { draft, setDraft, catalog, members })` (`features/chat/use-composer-field.ts`: cursor, sugestões, `pickEmote`) e `comboboxPropsOf`. O chat da mesa passa os comandos e as pessoas; a conversa entre amigos (`features/friends/conversation-composer.tsx`) passa listas vazias, então só o `:` abre — e por isso o campo das DMs é `combobox`, não `textbox`. O `ref` nasce no componente: devolvê-lo dentro do objeto do hook quebra a regra `react-hooks/refs` do React Compiler.
- **"Atalhos"** lista `:nome` e `:) :D <3`.

## Balão do token (PixiJS)

- `src/renderer/speech-flow.ts` (puro): `speechRunsOf(text)` corta em palavras e figuras, cada uma com `spaced`; `flowSpeechItems(sizes, maxWidth)` deita da esquerda para a direita, quebra a linha quando o próximo passa da largura (216 px), centra cada peça na altura da linha e não conta a folga no fim da linha.
- `src/renderer/pixi-speech-line.ts`: `speechLineOf(text, { style, ink, maxWidth, redraw })` — sem emote, o `Text` de sempre; com emote, um `Text` por palavra e um `Sprite` por figura (smiley 20 px, meme 26 px), já com tamanho antes da textura chegar (`Assets.load` da URL do `emoteImageUrlOf`). A chegada chama `redraw`.
- **Espaço:** o PixiJS mede um `Text` sem o espaço do fim ("Ninguém " = "Ninguém"), e o balão saía "Ninguémmepega". O espaço vira `gapAfter`, medido uma vez por balão como `"a a" − "aa"` (`CanvasTextMetrics`).
- `PixiSpeechLayer`: o `SpeechBubbleMaker` recebe `redraw`; a camada marca `redrawDue` e o próximo `animate` pede um render (o tabuleiro só desenha sob demanda).

## Testes

`test/lib/emote-catalog.spec.ts` (contagens, sem estrela, códigos e ids únicos, todo emote com `:nome:`), `test/lib/emote-text.spec.ts` (smiley e meme, mais longo, caixa, colado em palavra, pontuação e quebra de linha, vazio, `emotesOnly`), `test/lib/emote-input.spec.ts` (`:nome:`, palavra-chave, ordem, busca, inserção no cursor), `test/lib/chat-suggestions.spec.ts` (consulta `emote` e o que não abre), `test/emotes/emote-images.spec.ts` (todo id tem imagem, id desconhecido), `test/components/emote-text.spec.tsx` (tamanhos, figurinha, texto sem código), `test/components/emote-picker.spec.tsx` (abas, clique fecha, busca e "Nada encontrado.", desabilitado), `test/renderer/speech-flow.spec.ts` (palavras com espaço — regressão do "Ninguémmepega" —, linha, quebra, peça larga, vazio) e o caso de `redraw` em `test/renderer/pixi-speech-layer.spec.ts`. Pela tela: `chat-panel.spec.tsx` (imagem no feed), `chat-composer.spec.tsx` (lista do `:` com miniatura; botão escreve no cursor e devolve o foco), `chat-shortcuts-button.spec.tsx` (as linhas novas) e `friend-conversation.spec.tsx` (imagem na DM; `:` e botão no campo). `pixi-speech-line.ts` não tem unit: mede texto e carrega textura (só no navegador); confere-se no app, falando como token na mesa de estresse.
