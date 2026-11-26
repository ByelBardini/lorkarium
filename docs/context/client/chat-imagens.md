# Client · imagens no chat

Índice: [`chat.md`](chat.md) · o server e o arquivo: [`../chat.md`](../chat.md) e [`../assets/imagens-do-chat.md`](../assets/imagens-do-chat.md).

Uma imagem por mensagem, com legenda opcional, em qualquer conversa da mesa (Mesa, sussurro, privado, grupo; falando como token ou personagem também). As DMs entre amigos não têm imagem.

## Estado (`src/lib/chat-attachment.ts`, puro)

- `ChatAttachment`: `empty` | `rejected` (`type`, `size` ou `link`, antes de qualquer pedido) | `uploading { uploadId }` | `ready { uploadId, image: { assetId, width, height } }` | `failed { failure: AssetsFailure }`.
- `attachingFile(uploadId, file)` (tipos do `ASSET_MIME_TYPES`, até `CHAT_IMAGE_MAX_BYTES`), `attachingLink(uploadId, texto)` (`chatImageLinkOf` = o `assetLinkDto`: aparado, só http/https), `attachmentAfterUpload(atual, uploadId, resultado)` (a resposta de um envio trocado ou removido é ignorada pelo `uploadId`), `chatImageRefOf` (o `{ assetId }` do `chat:send`, só pronta), `canSendWith(anexo, texto)` (pronta vai sozinha; durante o envio nada vai; recusada ou falha não segura o texto). `CHAT_IMAGE_ACCEPT` é o `accept` do seletor.

## Composer (`features/chat/`)

- `use-chat-attachment.ts` — `useChatAttachment(campaignId, assets)` → `{ attachment, attachFile, attachLink, remove }`: o arquivo ou o link sobe **na hora** como `chat_image` (`AssetsApi.upload` / `importLink`), então a prévia é a própria imagem guardada (`/api/assets/<id>`), sem URL local. `imageFileOf(files)` pega a primeira imagem de um colar ou soltar (sem arquivo, o colar continua texto).
- `chat-composer.tsx` — o hook vive no `ChatComposer` (a `key` da conversa zera o anexo junto do rascunho); `uploadTo: { campaignId, assets }` vem do `ComposerSlot` (`ChatServices.assets`). Entradas: **colar** (`onPaste` do campo), **soltar** na caixa (`onDragOver`/`onDrop`), o **clipe** "Anexar imagem" (input de arquivo oculto, "Escolher imagem") e **Ctrl+I** (ou Cmd+I) no campo, com `preventDefault`, que abre o campo "Link da imagem" com o foco; Enter importa, Esc fecha e devolve o foco à "Mensagem" (o `stopPropagation` não deixa o Esc fechar a gaveta).
- `chat-attachment-bar.tsx` — `ChatAttachmentPreview` (acima do campo: "Enviando imagem…" em `status`, a miniatura "Imagem anexada", ou o motivo em `alert`; sempre com "Remover imagem") e `ChatImageLinkField`.
- `use-chat-composer.ts` — recebe `picture`; Enter com a imagem pronta manda `image` junto da mensagem ou do `/w`, ou sozinha com o campo vazio; o sucesso limpa o campo e o anexo. A falha `image_expired` mantém o texto.
- Textos em `chat-messages.ts`: `chatAttachmentProblem` (tipo, 10 MB, link, e o resto pelo `imageFailureMessage` do seletor de imagens, `plan_limit` incluso); a linha de uma mensagem só com imagem é `enviou uma imagem` (`IMAGE_ONLY_LINE`, no anunciador, na barra e na prévia). "Atalhos" lista Ctrl+V e Ctrl+I.

## Feed

- `chat-message-image.tsx` — `ChatMessageImage({ image, authorName })` na `ChatMessageRow`: `<img>` com `width`/`height` do evento (o feed reserva o espaço), `loading="lazy"`, até `max-h-60`, `alt` "Imagem de <voz>"; o botão em volta abre o `ImageViewerModal` da biblioteca (`description` "Imagem enviada no chat"; o `ImageView` só lê o `id`). `onError` troca por "Imagem expirada" (a varredura apagou), sem tela cheia. Sem texto, a linha não desenha o parágrafo vazio.

## Testes

`test/lib/chat-attachment.spec.ts` (tipos, 10 MiB, link aparado e recusado, resposta ok/recusa/velha/depois de remover, envio), `test/features/chat/chat-attachment-bar.spec.tsx` (colar, soltar, clipe com `accept`, só imagem, legenda, Enter durante o envio, colar texto, remover, tipo, 11 MiB, plano, `image_expired`; Ctrl+I: foco, importar, Esc, link recusado e inalcançável), `test/features/chat/chat-message-image.spec.tsx` (tamanho e `alt`, tela cheia, expirada, sem parágrafo vazio), os casos `image` de `chat-commands.spec.ts`, `chat-history-store.spec.ts` (F5 e histórico antigo), `chat-messages.spec.ts` e `chat-shortcuts-button.spec.tsx`.
