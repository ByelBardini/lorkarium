# Contratos da biblioteca mista

library-image.dto.ts: libraryImageDto/LibraryImageDto {id,name,folderId,visibility,asset,updatedAt}; nome aparado, com 1–60 caracteres. createLibraryImageRequestDto exige name/assetId, folderId/visibility opcionais. updateLibraryImageRequestDto exige ao menos name/folderId/visibility; null é raiz. Corpos estritos recusam identidade forjada. libraryImageParamsDto valida campanha/imagem.

campaign-library.dto.ts: campaignLibraryDto/CampaignLibraryDto estende formato antigo com images. GET /library usa o agregado; GET /scenes mantém libraryDto estrito sem images.

image-presentation.dto.ts: imagePresentationDto {id,imageId,name,asset}, nome com 1–60 caracteres; imagePresentationStateDto/ImagePresentationStateDto {campaignId,version>=0,at,presentation:null|imagem}. imagePresentationChangedDto/ImagePresentationChangedDto adiciona eventId UUID; alias libraryImagePresentationChangedDto/LibraryImagePresentationChangedDto. Evento library:imagePresentationChanged em LibraryServerEvents/TableServerEvents, sem pasta/metadados privados.

assetPurposeDto aceita library_image; ASSET_MAX_SIDE.library_image=4096. Permissões ficam no server. Rotas e garantias: [library/images.md](../library/images.md).

Spec packages/contracts/test/library/library-image.dto.spec.ts cobre trim, limites, PATCH vazio, identidade forjada, versão negativa e compatibilidade estrita do endpoint antigo.

## Documentos no agregado

campaignLibraryDto exige documents: DocumentSummaryDto[], com id, nome, pasta, visibilidade, versão, updatedAt e capacidades; ownerIds só para mestre. Não inclui conteúdo. libraryDto de GET /scenes segue sem documentos. Contratos completos em [../documents/contratos.md](../documents/contratos.md).
