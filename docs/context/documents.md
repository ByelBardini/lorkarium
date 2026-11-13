# Documentos

Documentos livres de texto da biblioteca, independentes de sistema de RPG. O detalhe (`schemaVersion: 2`) lista as abas visíveis ao leitor, sem corpo; cada aba guarda o próprio JSON fechado (árvore Tiptap, `schemaVersion: 1`) e a própria versão. Novo documento: oculto, sem donos, versão zero, título “Documento sem nome”, prévia vazia e uma aba "Geral" com um parágrafo vazio. A **prévia** (resumo e/ou capa, `PATCH …/:documentId/preview`, de quem edita) é o que a biblioteca mostra no lugar do corpo: [contratos](documents/contratos.md), [servidor](documents/server.md), [imagens](documents/imagens.md) (a capa) e [cliente](client/documents.md).

## Referências

- [Abas](documents/abas.md): tabela, migração do corpo para "Geral", regra de visibilidade, rotas e imagens por aba.
- [Contratos](documents/contratos.md): conteúdo, comandos, limites e respostas.
- [Persistência e serviços](documents/server.md): tabelas, transações, recibos e rotas.
- [Imagens](documents/imagens.md): preparação, referência confirmada e autorização dos bytes.
- [Testes](documents/testes.md): provas e execução isolada.
- [Cliente](client/documents.md): editor, rascunho e biblioteca.
- [Fichas que leem documentos](sheets/documentos.md): só os públicos e as abas `document`, igual para todos.

## Acesso

Mestres administram e editam; jogadores selecionados como donos leem e editam inclusive documentos ocultos. Posse não concede administração. Jogadores sem posse e espectadores só leem públicos. A posse especial só vale enquanto o participante tem papel de jogador. Documentos privados inacessíveis e IDs de outra campanha são indistinguíveis de documento inexistente.

O servidor calcula `canEdit`/`canManage`; a lista de donos só aparece para mestres. A biblioteca traz resumos, sem corpo. O detalhe aberto é reautorizado em cada operação. `library:changed` invalida a lista e o documento aberto sem transmitir títulos ou conteúdo oculto.

## Tempo real

- **Estrutura** (criar, renomear, ocultar, reordenar ou excluir aba; renomear, mudar a prévia, administrar, excluir documento) → `library:changed` `{ campaignId, at }` para a sala da mesa: a biblioteca e o documento aberto releem pela rota.
- **Corpo de uma aba** (`PATCH …/tabs/:tabId/content` aplicado) → **só** `document:tabChanged` `{ campaignId, documentId, tabId, version, at }` (`documentTabChangedDto`, `DOCUMENT_EVENTS.tabChanged`; `version` é a nova versão da aba), depois do commit; nunca `library:changed`, então ninguém relê a biblioteca por uma edição. Vai para a sala da mesa (`campaignRoom`); aba `masters` vai só para a sala dos mestres (`campaignMastersRoom`). Recibo repetido (mesmo `actionId`) e pedido recusado não publicam. Quem tem aquela aba aberta com versão menor relê a aba pela rota (`GET …/tabs/:tabId`, que reautoriza); outra aba, outro documento ou versão igual/menor são ignorados.

**"Aparece em".** `GET /campaigns/:campaignId/documents/:documentId/map-appearances` lista as regiões de mapa ligadas ao documento, para quem pode lê-lo: quem não lê leva `DOCUMENT_NOT_FOUND`, e cada um só vê as regiões que pode ver (ligada a aba `masters`, só o mestre). A linha cita a aba quando o link é para uma ("Mundo › Capital · aba Itens"). Mora no módulo dos mapas; ver [regiões do mapa](library-maps/regioes.md).

**Acesso por aba.** A aba não tem direito próprio: quem lê o documento lê as abas `document`, e quem edita (mestre ou dono) cria, renomeia, reordena, exclui e escreve nelas. Só o mestre muda a visibilidade. A aba `masters` só existe para mestres: some da lista do detalhe, responde `DOCUMENT_TAB_NOT_FOUND` pelo id (nunca 403) e as imagens só dela não são servidas a mais ninguém. O reordenar do jogador mexe só nas casas das abas que ele vê; a oculta fica onde estava. Regra e rotas em [abas](documents/abas.md); bytes em [imagens](documents/imagens.md).
