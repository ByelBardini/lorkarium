# Documentos

Documentos livres de texto da biblioteca, independentes de sistema de RPG. O conteúdo é um JSON fechado, com `schemaVersion: 1` no detalhe e árvore Tiptap em `content`. Novo documento: oculto, sem donos, versão zero, título “Documento sem nome” e um parágrafo vazio.

## Referências

- [Contratos](documents/contratos.md): conteúdo, comandos, limites e respostas.
- [Persistência e serviços](documents/server.md): tabelas, transações, recibos e rotas.
- [Imagens](documents/imagens.md): preparação, referência confirmada e autorização dos bytes.
- [Testes](documents/testes.md): provas e execução isolada.
- [Cliente](client/documents.md): editor, rascunho e biblioteca.
- Plano aprovado: [documentos na biblioteca](../plans/2026-10-29-documentos-na-biblioteca.md).

## Acesso

Mestres administram e editam; jogadores selecionados como donos leem e editam inclusive documentos ocultos. Posse não concede administração. Jogadores sem posse e espectadores só leem públicos. A posse especial só vale enquanto o participante tem papel de jogador. Documentos privados inacessíveis e IDs de outra campanha são indistinguíveis de documento inexistente.

O servidor calcula `canEdit`/`canManage`; a lista de donos só aparece para mestres. A biblioteca traz resumos, sem corpo. O detalhe aberto é reautorizado em cada operação. `library:changed` invalida a lista e o documento aberto sem transmitir títulos ou conteúdo oculto.
