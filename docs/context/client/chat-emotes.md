# Client · memes e smileys

Índice: [`../client.md`](../client.md) · chat: [`chat.md`](chat.md) · amigos: [`../friends.md`](../friends.md).

O texto enviado **não muda**: o server recebe e repassa `:doge:` ou `:)` como qualquer texto (nada no contrato nem no `chat:send`/`dm:send`). A troca por imagem é só na hora de desenhar, no client.

## Catálogo (`packages/contracts/src/emotes/`)

Os dados moram no contracts porque o server reserva os nomes do catálogo para os emojis personalizados ([`../custom-emojis.md`](../custom-emojis.md)); as imagens continuam no client.

- `emote.ts` — `Emote` = `{ id, kind: 'smiley' | 'meme', category, codes, keywords, unicode }`. `id` é o nome do arquivo (`client/src/emotes/images/<id>.png`); o **primeiro código** é o que o seletor insere; `keywords` (pt-BR, sem acento) são para a busca; `unicode` é o emoji do teclado, **sem** `U+FE0F` (`null` nos memes). `EMOTE_CATEGORIES` = `reactions`, `gestures`, `rpg`, `symbols`, `memes` (as abas, nessa ordem). Os macacos (🙈🙉🙊🐵🐒🦍🦧) ficam no fim de Reações, sem aba própria (escolha do usuário). Fábricas `smiley`, `noto` (só o código `:id:`) e `meme`.
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
- **Botão "Memes e smileys"** — `src/components/emote-picker.tsx` (`EmotePicker({ onPick, disabled })`): popover para cima com busca (`searchEmotes`, em qualquer código ou palavra-chave, em todas as abas) e uma aba por `EMOTE_CATEGORIES`, cada uma desenhada por uma imagem dela (`CATEGORY_TABS`: 😊, 👍, 🎲, ❤, doge) com o nome (Reações, Gestos, RPG, Símbolos, Memes) em `aria-label` e `title` — as palavras não cabem no popover; cada célula é um botão com o **primeiro código** como nome. O popover tem **altura fixa** (`h-96`): a área das imagens (`SCROLL_AREA`) ocupa o que sobra e rola por dentro, então não cresce nem encolhe com a aba ou a busca. O clique chama `onPick` e **não fecha** (vários seguidos; fecha por Esc ou clique fora) — o `onFocusOutside` é cancelado porque o `onPick` devolve o foco ao campo, o que fechava o popover; `withEmoteCode(draft, caret, code)` escreve no cursor (espaço antes se colado numa palavra, um depois) e o campo pega o foco de volta.
- **Os dois campos** usam `useComposerField(ref, { draft, setDraft, catalog, members })` (`features/chat/use-composer-field.ts`: cursor, sugestões, `pickEmote`) e `comboboxPropsOf`. O chat da mesa passa os comandos e as pessoas; a conversa entre amigos (`features/friends/conversation-composer.tsx`) passa listas vazias, então só o `:` abre — e por isso o campo das DMs é `combobox`, não `textbox`. O `ref` nasce no componente: devolvê-lo dentro do objeto do hook quebra a regra `react-hooks/refs` do React Compiler.
- **"Atalhos"** lista `:nome` e `:) :D <3`.

## Emojis personalizados (da conta)

Regra, rotas e evento em [`../custom-emojis.md`](../custom-emojis.md). No client:

- **Dados:** `services/custom-emojis-api.ts` (`HttpCustomEmojisApi`: `list`, `create(name, blob)` por `callUpload` com `?name=`, `rename`, `remove`; falhas `name_taken`, `too_large`, `unsupported_image`, `not_found`, `plan_limit` e as comuns) → `stores/custom-emojis-store.ts` (`createCustomEmojisStore`; cada comando devolve se passou; `activeCustomEmojisOf(list)`) → `components/custom-emojis/` (`CustomEmojisProvider` no `router.tsx`, logo dentro do `SavedColorsProvider`, carrega a lista ao montar; `useCustomEmojisStore()` fora de um provider dá uma lista vazia).
- **Desenho:** `emotePiecesOf(text, customEmojis)` ganhou a peça `{ kind: 'custom', emojiId, code }` — o `:nome:` só vira imagem se a **mensagem** o traz (`event.customEmojis` do `chat:sent`/`dm:sent`), com a mesma regra de "solto". `EmoteText({ text, customEmojis })` e `CustomEmojiImage` (tamanho de meme; `/api/custom-emojis/<id>` por `customEmojiImageUrlOf`). O balão leva `customEmojis` do `SpeechBalloon` ao `speechRunsOf(text, customEmojis)` (run `custom`), e o sprite carrega com `parser: 'texture'` (a URL não tem extensão).
- **Inserir:** a lista do `:` põe os ativos da conta antes do catálogo (`suggestCustomEmojis`, dentro do limite de 8, descrição "Seu emoji"); o seletor abre na aba **Meus emojis** (`OwnEmojiGrid`) quando a conta tem algum ativo, e a busca também os acha pelo nome.
- **Tela:** "Minha conta" → aba **Emojis** (`?aba=emojis`, `features/account/custom-emojis-section.tsx`, `author` = o perfil), no `SettingsLayout` das outras abas. À esquerda o formulário (`custom-emoji-form.tsx`): quadrado de soltar/escolher que mostra a imagem (`useObjectUrl`), nome com `:` na frente (minúsculo e `_` por `typedCustomEmojiName`; `customEmojiNameProblem` recusa antes de enviar) e "Adicionar emoji". Clicar num ladrilho da grade (`custom-emoji-item.tsx`, `aria-pressed`, anel dourado no escolhido) carrega o emoji no formulário: imagem fixa (trocar = apagar e criar), "Salvar nome", "Apagar" (pergunta "Apagar / Manter") e "Cancelar"; com a cota cheia, editar continua possível. Acima da grade, "Seus emojis" com "N de M" e barra reta de 2 px; inativo apagado com "INATIVO". À direita, `custom-emoji-preview.tsx`: vazio até haver imagem no formulário (escolhida ou do emoji clicado); com ela, dois exemplos separados e maiores que o chat ("No meio do texto" e "Sozinho, vira figurinha"), cada um uma mensagem da própria conta (avatar, nome, "agora"). O rascunho e o emoji em edição são da seção (`useEditor`), e toda resposta aceita limpa o formulário. Grátis vê "Disponível a partir do plano Apoiador…". Textos em `lib/custom-emoji-text.ts`.

## Balão do token (PixiJS)

- `src/renderer/speech-flow.ts` (puro): `speechRunsOf(text)` corta em palavras e figuras, cada uma com `spaced`; `flowSpeechItems(sizes, maxWidth)` deita da esquerda para a direita, quebra a linha quando o próximo passa da largura (216 px), centra cada peça na altura da linha e não conta a folga no fim da linha.
- `src/renderer/pixi-speech-line.ts`: `speechLineOf(text, { style, ink, maxWidth, redraw })` — sem emote, o `Text` de sempre; com emote, um `Text` por palavra e um `Sprite` por figura (smiley 20 px, meme 26 px), já com tamanho antes da textura chegar (`Assets.load` da URL do `emoteImageUrlOf`). A chegada chama `redraw`.
- **Espaço:** o PixiJS mede um `Text` sem o espaço do fim ("Ninguém " = "Ninguém"), e o balão saía "Ninguémmepega". O espaço vira `gapAfter`, medido uma vez por balão como `"a a" − "aa"` (`CanvasTextMetrics`).
- `PixiSpeechLayer`: o `SpeechBubbleMaker` recebe `redraw`; a camada marca `redrawDue` e o próximo `animate` pede um render (o tabuleiro só desenha sob demanda).

## Testes

`packages/contracts/test/emotes/emote-catalog.spec.ts` (memes escolhidos, contagem, `unicode` dos antigos, códigos, ids e `unicode` únicos, sem `U+FE0F`, categoria, `isCatalogEmoteName`, `emoteOfUnicode`), `client/test/lib/emote-text.spec.ts` (smiley e meme, mais longo, caixa, colado em palavra, pontuação e quebra de linha, vazio, `emotesOnly`; emoji do teclado: solto, colado, com e sem `U+FE0F`, fora do catálogo, ZWJ e tom de pele, figurinha), `test/lib/emote-input.spec.ts` (`:nome:`, palavra-chave, ordem, busca, inserção no cursor), `test/lib/chat-suggestions.spec.ts` (consulta `emote` e o que não abre), `test/emotes/emote-images.spec.ts` (todo id tem imagem, id desconhecido), `test/components/emote-text.spec.tsx` (tamanhos, figurinha, texto sem código), `test/components/emote-picker.spec.tsx` (uma aba por categoria, macacos em Reações, RPG, Memes, setas entre abas, clique não fecha, busca e "Nada encontrado.", desabilitado), `test/renderer/speech-flow.spec.ts` (palavras com espaço — regressão do "Ninguémmepega" —, linha, quebra, peça larga, vazio) e o caso de `redraw` em `test/renderer/pixi-speech-layer.spec.ts`. Personalizados: `test/services/custom-emojis-api.spec.ts`, `test/stores/custom-emojis-store.spec.ts`, `test/lib/custom-emoji-text.spec.ts`, os casos `custom` de `emote-text.spec.ts`, `emote-input.spec.ts` (`suggestCustomEmojis`), `speech-flow.spec.ts`, `components/emote-text.spec.tsx`, `components/emote-picker.spec.tsx` (aba Meus) e `features/account/custom-emojis-section.spec.tsx`; fake `test/support/custom-emojis-api-fake.ts`. Pela tela: `chat-panel.spec.tsx` (imagem no feed), `chat-composer.spec.tsx` (lista do `:` com miniatura; botão escreve no cursor e devolve o foco; continua aberto entre cliques até o Esc — regressão), `chat-shortcuts-button.spec.tsx` (as linhas novas) e `friend-conversation.spec.tsx` (imagem na DM; `:` e botão no campo). `pixi-speech-line.ts` não tem unit: mede texto e carrega textura (só no navegador); confere-se no app, falando como token na mesa de estresse.
