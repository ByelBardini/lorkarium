# Documentos — imagens

Hub: [../documents.md](../documents.md).

`DocumentImagesService` autoriza editor antes de enviar/importar e revalida na transação de associação. Reutiliza `AssetsService.uploadDocumentImage`/`importDocumentImage`, o processador Sharp, fetcher com guardas de rede e S3 existentes. Sem fetch/S3 sob trava. Revogação durante I/O impede associação; eventual órfão fica inacessível.

Propósito `document_image`: PNG/JPEG/WebP estáticos, 20 MiB e maior lado 4096. Rotas genéricas de Assets recusam esse propósito antes de I/O; as rotas do documento são a entrada autorizada. Guardas de fundo/token/forma/aura/condição/capa também o recusam. GIF/SVG e hotlink não entram.

Preparar grava uma associação com `in_content=false`; só editores atuais leem esses bytes. Salvar conteúdo verifica que todos os `assetId` estão associados ao próprio documento e atualiza `in_content` atomicamente. Leitores públicos só acessam referências confirmadas.

`DocumentAssetReadPolicy` consulta participação e documentos no snapshot. `build-app` compõe essa política com a política da biblioteca: `library_image` pode ser legível pelo item/apresentação ou documento; `document_image` depende do documento. Sem política, Assets nega ambos. Toda leitura reservada usa `private, no-store`.

Inserir da biblioteca verifica que o item pertence à campanha e está autorizado ao editor. Associa o asset imutável, sem expor nome/pasta da origem. Apagar o item da biblioteca não apaga o asset nem a associação. Ocultar/remover dono só revoga o acesso por este documento; outra origem autorizada continua válida. A leitura não aceita um asset arbitrário da campanha sem associação.
