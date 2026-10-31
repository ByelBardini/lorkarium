# Documentos

Documentos livres de texto da biblioteca, independentes de sistema de RPG. O detalhe (`schemaVersion: 2`) lista as abas visíveis ao leitor, sem corpo; cada aba guarda o próprio JSON fechado (árvore Tiptap, `schemaVersion: 1`) e a própria versão. Novo documento: oculto, sem donos, versão zero, título “Documento sem nome” e uma aba "Geral" com um parágrafo vazio.

## Referências

- [Abas](documents/abas.md): tabela, migração do corpo para "Geral", regra de visibilidade, rotas e imagens por aba.
- [Contratos](documents/contratos.md): conteúdo, comandos, limites e respostas.
- [Persistência e serviços](documents/server.md): tabelas, transações, recibos e rotas.
- [Imagens](documents/imagens.md): preparação, referência confirmada e autorização dos bytes.
- [Testes](documents/testes.md): provas e execução isolada.
- [Cliente](client/documents.md): editor, rascunho e biblioteca.
- Plano aprovado: [documentos na biblioteca](../plans/2026-10-29-documentos-na-biblioteca.md).

## Acesso

Mestres administram e editam; jogadores selecionados como donos leem e editam inclusive documentos ocultos. Posse não concede administração. Jogadores sem posse e espectadores só leem públicos. A posse especial só vale enquanto o participante tem papel de jogador. Documentos privados inacessíveis e IDs de outra campanha são indistinguíveis de documento inexistente.

O servidor calcula `canEdit`/`canManage`; a lista de donos só aparece para mestres. A biblioteca traz resumos, sem corpo. O detalhe aberto é reautorizado em cada operação. `library:changed` invalida a lista e o documento aberto sem transmitir títulos ou conteúdo oculto.

**Acesso por aba.** A aba não tem direito próprio: quem lê o documento lê as abas `document`, e quem edita (mestre ou dono) cria, renomeia, reordena, exclui e escreve nelas. Só o mestre muda a visibilidade. A aba `masters` só existe para mestres: some da lista do detalhe, responde `DOCUMENT_TAB_NOT_FOUND` pelo id (nunca 403) e as imagens só dela não são servidas a mais ninguém. O reordenar do jogador mexe só nas casas das abas que ele vê; a oculta fica onde estava. Regra e rotas em [abas](documents/abas.md); bytes em [imagens](documents/imagens.md).
