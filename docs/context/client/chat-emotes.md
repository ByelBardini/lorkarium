# Client · memes e smileys

Índice: [`../client.md`](../client.md) · chat: [`chat.md`](chat.md) · amigos: [`../friends.md`](../friends.md).

O texto enviado **não muda**: o server recebe e repassa `:doge:` ou `:)` como qualquer texto (nada no contrato nem no `chat:send`/`dm:send`). A troca por imagem é só na hora de desenhar, no client.

## Catálogo (`packages/contracts/src/emotes/`)

Os dados moram no contracts porque o server reserva os nomes do catálogo para os emojis personalizados ([`../custom-emojis.md`](../custom-emojis.md)); as imagens continuam no client.

- `emote.ts` — `Emote` = `{ id, kind: 'smiley' | 'meme', category, codes, keywords, unicode }`. `id` é o nome do arquivo (`client/src/emotes/images/<id>.png`); o **primeiro código** é o que o seletor insere; `keywords` (pt-BR, sem acento) são para a busca; `unicode` é o emoji do teclado, **sem** `U+FE0F` (`null` nos memes). `EMOTE_CATEGORIES` = `reactions`, `gestures`, `rpg`, `symbols`, `monkeys`, `memes` (as abas, nessa ordem). Fábricas `smiley`, `noto` (só o código `:id:`) e `meme`.
- `emote-smileys.ts` — `SMILEYS` (131): os 24 de antes (com os códigos de texto) e os 107 Noto escolhidos pelo usuário. `emote-memes.ts` — `MEMES` (11).
- `emote-catalog.ts` — `EMOTES` (smileys antes), `isNamedEmoteCode(code)`, `isCatalogEmoteName(name)` (o `:nome:` do catálogo sem caixa), `emoteOfUnicode(char)` (ignora o `U+FE0F`) e `emotesIn(category)`.
- Todo emote tem `:nome:` e categoria; nenhum código, id ou `unicode` repete; nenhum `unicode` leva `U+FE0F`; só meme está na aba Memes: o spec do catálogo garante. Sem `:gold:`, por escolha do usuário.

## Troca (`src/lib/emote-text.ts`)

- `emotePiecesOf(text)` → `EmotePiece[]` (`{ kind: 'text', text }` | `{ kind: 'emote', emote, code }`, `code` como foi digitado). O código mais longo ganha (`:-D`, nunca `:-` + `D`); índice por primeiro caractere, montado uma vez.
- Só vale **solto**: antes, início ou espaço; depois, fim, espaço ou `.,!?;`. Por isso `10:30`, `http://`, `a:b`, `oi:)` e `:D:D` ficam texto.
- `:nome:` casa sem caixa (`:Doge:`); smiley de texto só como escrito (`xd` não é `xD`).
- **Emoji do teclado** (`unicodeAt`): um emoji com `unicode` no catálogo vira a imagem **mesmo colado** (`oi😂kkk`), com ou sem `U+FE0F` (que entra no `code`). Seguido de ZWJ (`U+200D`) ou tom de pele (`U+1F3FB`–`1F3FF`), é parte de um emoji maior que o catálogo não tem e fica texto.
- `emotesOnly(pieces)` → só imagens e espaços: a mensagem vira "figurinha" (40 px).

## Desenho

- `src/components/emote-text.tsx` — `EmoteText({ text })` (o texto com as imagens no lugar) e `EmoteImage({ emote, code, sticker })`. Tamanho em `em`: smiley `1.375em`, meme `1.75em` (acompanham a fala de personagem em 17 px), figurinha `size-10`. `alt` e `title` = o código (leitor de tela e hover).
- Usado em `chat-message-row.tsx` (feed da mesa: Mesa, sussurro, privado, grupo, fala de token) e em `features/friends/conversation-feed.tsx` (DMs). A prévia, a barra, o aviso e o anunciador continuam com o texto cru (`chatLineOf`).
- `src/emotes/emote-images.ts` — `emoteImageUrlOf(id)` pelo `import.meta.glob('./images/*.png', { eager, query: '?url' })`: cada PNG vira `assets/<id>-<hash>.png` (cache imutável), e só baixa quando aparece numa mensagem. Id sem arquivo → erro com o id e o caminho esperado.

## Imagens (`src/emotes/images/`, 142 PNG, 96 px)

- **Smileys e Noto:** Noto Emoji (Google, Apache 2.0), `png/128` da tag `v2.047` (`emoji_u<codepoint>.png`), reduzidos para 96 px. Escolha do usuário entre Fluent 3D, Noto e Twemoji: não trocar sem perguntar. O `unicode` dos 24 antigos saiu da comparação de pixels com os candidatos do Noto (por isso `smile` é 😊 e `giggle` é 🤭).
- **Memes do Firecast:** `okayface`, `vish`, `yaoming`, `huehue`, `dinofauro`, `doge` (os outros 14 saíram a pedido do usuário). **Sem licença**: os Termos do Firecast só dão uso pessoal e os rage faces não têm dono claro; ficam fora da licença do repositório. O usuário aceitou o risco.
- **`chad` e `stonks`:** as versões comuns de 128 px do CDN de emojis do Discord, aprovadas pelo usuário vendo; sem licença, mesmo aceite. O GigaChad (foto de pessoa real) ficou de fora.
- **Originais:** `nat20`, `nat1` e `mimic`, desenhados para o projeto (licença do repositório); o SVG de cada um fica em `src/emotes/drawn/` (fora do bundle) e vira PNG pelo `sharp` (`resize(96, 96)`).
- **Removidos por ter dono que cobra:** `pikachu` (Nintendo), `pacman` (Bandai Namco, era o smiley `:v`) e `trollface` (o autor registrou e cobra licença). Não trazer de volta nem pôr personagem de franquia no lugar.
- Refazer: redimensionar para 96×96 com bicúbico e fundo transparente; o nome do arquivo é o `id` do catálogo.

## Inserir (`src/lib/emote-input.ts`)

- **Lista do `:`** — `suggestionQueryOf` (`chat-suggestions.ts`) devolve `{ kind: 'emote' }` para `:` + 2 caracteres no começo de uma palavra (um `:` sozinho, `:)` ou `10:30` não abrem). `suggestEmotes(typed)` acha pelo `:nome:` ou pela palavra-chave (sem acento nem caixa), na ordem do catálogo, até `EMOTE_SUGGESTION_LIMIT` (8); mostra o `:nome:` que casou ou, por palavra-chave, o primeiro `:nome:`. A linha (`ComposerSuggestion.emote`) desenha a miniatura decorativa (`alt=""`); aceitar escreve o código e um espaço.
- **Botão "Memes e smileys"** — `src/components/emote-picker.tsx` (`EmotePicker({ onPick, disabled })`): popover para cima com busca (`searchEmotes`, em qualquer código ou palavra-chave, em todas as abas) e uma aba por `EMOTE_CATEGORIES`, cada uma desenhada por uma imagem dela (`CATEGORY_TABS`: 😊, 👍, 🎲, ❤, 🙈, doge) com o nome (Reações, Gestos, RPG, Símbolos, Macacos, Memes) em `aria-label` e `title` — seis palavras não cabem no popover; cada célula é um botão com o **primeiro código** como nome. O clique fecha e chama `onPick`; `withEmoteCode(draft, caret, code)` escreve no cursor (espaço antes se colado numa palavra, um depois) e o campo pega o foco de volta.
- **Os dois campos** usam `useComposerField(ref, { draft, setDraft, catalog, members })` (`features/chat/use-composer-field.ts`: cursor, sugestões, `pickEmote`) e `comboboxPropsOf`. O chat da mesa passa os comandos e as pessoas; a conversa entre amigos (`features/friends/conversation-composer.tsx`) passa listas vazias, então só o `:` abre — e por isso o campo das DMs é `combobox`, não `textbox`. O `ref` nasce no componente: devolvê-lo dentro do objeto do hook quebra a regra `react-hooks/refs` do React Compiler.
- **"Atalhos"** lista `:nome` e `:) :D <3`.

## Balão do token (PixiJS)

- `src/renderer/speech-flow.ts` (puro): `speechRunsOf(text)` corta em palavras e figuras, cada uma com `spaced`; `flowSpeechItems(sizes, maxWidth)` deita da esquerda para a direita, quebra a linha quando o próximo passa da largura (216 px), centra cada peça na altura da linha e não conta a folga no fim da linha.
- `src/renderer/pixi-speech-line.ts`: `speechLineOf(text, { style, ink, maxWidth, redraw })` — sem emote, o `Text` de sempre; com emote, um `Text` por palavra e um `Sprite` por figura (smiley 20 px, meme 26 px), já com tamanho antes da textura chegar (`Assets.load` da URL do `emoteImageUrlOf`). A chegada chama `redraw`.
- **Espaço:** o PixiJS mede um `Text` sem o espaço do fim ("Ninguém " = "Ninguém"), e o balão saía "Ninguémmepega". O espaço vira `gapAfter`, medido uma vez por balão como `"a a" − "aa"` (`CanvasTextMetrics`).
- `PixiSpeechLayer`: o `SpeechBubbleMaker` recebe `redraw`; a camada marca `redrawDue` e o próximo `animate` pede um render (o tabuleiro só desenha sob demanda).

## Testes

`packages/contracts/test/emotes/emote-catalog.spec.ts` (memes escolhidos, contagem, `unicode` dos antigos, códigos, ids e `unicode` únicos, sem `U+FE0F`, categoria, `isCatalogEmoteName`, `emoteOfUnicode`), `client/test/lib/emote-text.spec.ts` (smiley e meme, mais longo, caixa, colado em palavra, pontuação e quebra de linha, vazio, `emotesOnly`; emoji do teclado: solto, colado, com e sem `U+FE0F`, fora do catálogo, ZWJ e tom de pele, figurinha), `test/lib/emote-input.spec.ts` (`:nome:`, palavra-chave, ordem, busca, inserção no cursor), `test/lib/chat-suggestions.spec.ts` (consulta `emote` e o que não abre), `test/emotes/emote-images.spec.ts` (todo id tem imagem, id desconhecido), `test/components/emote-text.spec.tsx` (tamanhos, figurinha, texto sem código), `test/components/emote-picker.spec.tsx` (uma aba por categoria, RPG, Memes, setas entre abas, clique fecha, busca e "Nada encontrado.", desabilitado), `test/renderer/speech-flow.spec.ts` (palavras com espaço — regressão do "Ninguémmepega" —, linha, quebra, peça larga, vazio) e o caso de `redraw` em `test/renderer/pixi-speech-layer.spec.ts`. Pela tela: `chat-panel.spec.tsx` (imagem no feed), `chat-composer.spec.tsx` (lista do `:` com miniatura; botão escreve no cursor e devolve o foco), `chat-shortcuts-button.spec.tsx` (as linhas novas) e `friend-conversation.spec.tsx` (imagem na DM; `:` e botão no campo). `pixi-speech-line.ts` não tem unit: mede texto e carrega textura (só no navegador); confere-se no app, falando como token na mesa de estresse.
