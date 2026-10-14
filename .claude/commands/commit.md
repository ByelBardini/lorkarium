---
description: Separa as mudanças em commits atômicos com mensagens semânticas; cria branch se estiver na main; nunca faz push.
argument-hint: [contexto opcional sobre as mudanças]
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git switch:*), Bash(git checkout:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git add:*), Bash(git restore:*), Bash(git commit:*), Read, Grep, Glob, AskUserQuestion
---

# /commit — Commits atômicos com padrão semântico

Organize as mudanças atuais do repositório em commits atômicos, seguindo as regras abaixo à risca.

## Regras invioláveis

1. **NUNCA execute `git push`** — em nenhuma variação (`push`, `push -u`, `push --force`, etc.). O push é sempre decisão manual do usuário. Repare que `git push` não está na lista de comandos permitidos deste comando: isso é intencional.
2. **Se estiver na `main`/`master`/`desenvolvimento`, SEMPRE crie uma branch nova antes de qualquer commit.** Nunca commite direto na main ou branch de desenvolvimento — nem o primeiro commit do repositório.
3. **Se já estiver em outra branch, permaneça nela.** Não crie outra branch, não faça checkout/switch para trocar.
4. **Arquivo sensível nunca entra em commit sem confirmação explícita do usuário.**
5. **Nunca use `git add .`, `git add -A` ou `git commit -a`.** Adicione arquivos explicitamente, grupo por grupo.

## Passo a passo

### 1. Levantar o estado

```bash
git branch --show-current
git status
git diff HEAD          # tudo que mudou (staged + unstaged); sem commit ainda, use git status + leitura dos arquivos
git log --oneline -10  # estilo recente de mensagens do repo
```

Se não houver nenhuma mudança para commitar, informe e pare.

### 2. Criar branch (apenas se estiver na main/master)

Derive o nome do conteúdo das mudanças, em kebab-case, com prefixo padrão de mercado:

| Prefixo     | Quando usar                              |
| ----------- | ---------------------------------------- |
| `feature/`  | nova funcionalidade                      |
| `fix/`      | correção de bug                          |
| `hotfix/`   | correção urgente de produção             |
| `refactor/` | refatoração sem mudança de comportamento |
| `chore/`    | manutenção, dependências, configs        |
| `docs/`     | apenas documentação                      |

Exemplos: `feature/movimentacao-de-tokens-em-tempo-real`, `fix/reconexao-perde-versao-do-snapshot`, `refactor/ordem-de-turno-no-game-core`, `chore/fundacao-do-monorepo`.

Repositório sem nenhum commit ainda: `git switch -c <branch>` funciona do mesmo jeito (renomeia a branch que ainda não nasceu).

### 3. Barreira de arquivos sensíveis

Antes de qualquer `git add`, verifique se as mudanças incluem arquivos que não deveriam ser versionados:

- `.env` e variantes (`.env.local`, `.env.production`, ...) — `server/.env.example` é versionado de propósito
- chaves e certificados (`*.pem`, `*.key`, `id_rsa*`, keystores)
- credenciais e segredos (`credentials.json`, `secrets.*`, tokens/senhas hardcoded em configs)
- dumps de banco e artefatos gerados (`*.sql` de dump, `node_modules/`, `dist/`, `coverage/`)

Se encontrar algum: **avise o usuário via AskUserQuestion e NÃO adicione sem confirmação explícita.** Os demais commits seguem normalmente sem esses arquivos. Se não puder perguntar, deixe o arquivo de fora e liste-o no resumo final.

### 4. Separar em commits atômicos

- Um commit = um propósito. Agrupe por unidade lógica, não por conveniência.
- Nunca misture assuntos diferentes no mesmo commit (feature + formatação, refactor + fix, código + docs não relacionados).
- Prefira commits pequenos: se der para dividir de forma coerente, divida.
- Para cada grupo: `git add <arquivos específicos>` → commit → próximo grupo.
- Ordem natural: dependências primeiro (o VO do game-core e o DTO do contracts vêm antes ou junto da fatia do server que os usa — nunca um commit que deixa o build quebrado).

### 5. Mensagem no padrão de commits semânticos

Formato: `tipo(escopo): descrição` — minúsculas, sem ponto final, primeira linha com no máximo 72 caracteres, em pt-BR. Escopo = o workspace ou a área (`server`, `client`, `game-core`, `contracts`, `tokens`, `combat`, `infra`, `claude`).

Tipos: `feat`, `fix`, `hotfix`, `refactor`, `test`, `docs`, `style`, `chore`, `perf`, `build`, `ci`.

Corpo opcional: use quando o motivo da mudança não for óbvio pela descrição.

**Sem assinaturas ou autoria na mensagem** — nada de `Co-Authored-By`, "Generated with Claude Code" ou emojis de assinatura.

Exemplos:

```
feat(tokens): move token por evento com versão do estado
fix(sessions): reconexão descarta evento mais velho que o snapshot
refactor(game-core): ordem de turno sai do server para o game-core
test(combat): cobre avanço de rodada no último da iniciativa
docs(context): atualiza contexto do módulo de combate
chore(claude): porta comandos e skills do trakio
```

### 6. Finalizar

Mostre o resultado com `git log --oneline` dos commits criados e liste qualquer arquivo sensível deixado de fora. Termine aí: **o push é responsabilidade do usuário.**

## Contexto adicional do usuário

$ARGUMENTS
