# Documentos — imagens

Hub: [../documents.md](../documents.md). Abas: [abas.md](abas.md).

`DocumentImagesService` recebe o alvo `{ documentId, tabId }`, autoriza o editor **da aba** (visível e editável) antes de enviar/importar e revalida na transação de associação. Reutiliza `AssetsService.uploadDocumentImage`/`importDocumentImage`, o processador Sharp, fetcher com guardas de rede e S3 existentes. Sem fetch/S3 sob trava. Revogação durante I/O impede associação; eventual órfão fica inacessível. Dono pedindo upload numa aba `masters` recebe `DOCUMENT_TAB_NOT_FOUND` antes de qualquer I/O.

Propósito `document_image`: PNG/JPEG/WebP estáticos, 20 MiB e maior lado 4096. Rotas genéricas de Assets recusam esse propósito antes de I/O; as rotas da aba (`…/tabs/:tabId/images[/import|/from-library]`) são a entrada autorizada. Guardas de fundo/token/forma/aura/condição/capa também o recusam. GIF/SVG e hotlink não entram.

## Referência por aba (`0071_document_tab_assets`)

`library_document_assets` tem uma linha por imagem **e aba** (PK campanha/documento/asset/aba; FK composta para `library_document_tabs` cascade). A migração pôs toda referência existente, confirmada ou preparada, na aba "Geral" que a `0070` criou.

- Preparar grava a linha da aba com `in_content=false`.
- Salvar o corpo de uma aba (`DocumentTabsService.updateContent`): todo `assetId` do corpo precisa estar associado a **alguma aba que o autor vê** (preparado ali ou vindo de outra aba visível); senão `DOCUMENT_ASSET_NOT_FOUND`, sem gravar. Depois `DocumentAssetsDao.confirmTab` deixa a aba mostrando exatamente aqueles: os usados viram `in_content=true` (inseridos se vieram de outra aba) e os retirados voltam a preparados (o desfazer do editor continua valendo).
- `DocumentAssetReadPolicy.canRead`: lê as linhas do asset, e por documento exige leitura do documento e uma linha numa aba de `visibleTabsOf` (todas para o mestre, só `document` para os outros) com `in_content=true`, ou preparada quando o leitor edita o documento. Uma imagem só em "Segredos" não chega ao jogador nem pelos bytes; preparada nunca chega a quem só lê.

`build-app` compõe essa política com a da biblioteca: `library_image` pode ser legível pelo item/apresentação ou documento; `document_image` depende do documento. Sem política, Assets nega ambos. Toda leitura reservada usa `private, no-store`.

Inserir da biblioteca verifica que o item pertence à campanha e está autorizado ao editor. Associa o asset imutável à aba, sem expor nome/pasta da origem. Apagar o item da biblioteca não apaga o asset nem a associação. Ocultar/remover dono só revoga o acesso por este documento; outra origem autorizada continua válida. A leitura não aceita um asset arbitrário da campanha sem associação.

## Armadilhas

- **Imagem compartilhada entre abas.** A mesma imagem em "Itens" e em "Segredos" são duas linhas; tirar de "Itens" só rebaixa a linha de "Itens" (preparada), e o jogador perde os bytes mesmo com "Segredos" ainda mostrando a imagem ao mestre. Não deduza a autorização de "existe linha confirmada do documento": sempre cruze com as abas que o leitor vê.
- **Preparação também é por aba.** Uma preparação sem aba (como o plano previa, `tab_id` nulo) deixaria o dono ler, como editor, uma imagem que o mestre preparou para uma aba oculta; por isso a rota de imagem leva o `tabId` e a PK inclui a aba (sem nulos).

## Provas

Unit: `document-asset-read-policy.service.spec.ts` (imagem só em `masters` recusada ao leitor e servida ao mestre, dono não lê preparada em aba oculta, mesma imagem em aba visível continua servida) e `document-tabs.service.spec.ts` (imagem de aba invisível recusa o corpo; imagem de outra aba visível é confirmada; retirada volta a preparada). Integração: `document-tab-images.spec.ts` (Itens servida à Bia; Itens + Segredos servida e, fora de Itens, 404 à Bia e 200 à Ana; só em Segredos 404 à Bia, ao Caio e ao espectador; preparada só ao editor; Quelm 404; dono no upload de aba oculta 404) e `document-images.spec.ts` (fluxos anteriores pelas rotas da aba). Mutação: a política sem o filtro de aba visível deixou dois cenários de cada spec vermelhos; desfeita.
