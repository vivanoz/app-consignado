# Viva Noz Consignado

App de controle da operação em consignação da Viva Noz: estoque com representantes, saldo nas lojas, visitas, acertos e pagamentos.

## Regras do projeto

- **Só infraestrutura da Viva Noz.** GitHub: conta `vivanoz`. Supabase: projeto da Viva Noz (conta vivanozcastanhas@gmail.com). Nunca usar contas, repositórios ou projetos da Leaderei ou pessoais. Antes de `git push` ou de qualquer comando do Supabase, confira qual conta está ativa (`gh auth status`).
- Todo o dinheiro da operação passa por aqui. Mudança em regra de saldo, acerto, preço ou permissão vem com teste em `tests/banco.test.ts`.
- Saldo nunca é digitado: é a soma de `movimentacoes`. Lançamento não se edita nem se apaga; correção é um novo lançamento (estorno).
- O app não grava estoque, visita, acerto nem pagamento direto nas tabelas. Passa pelas funções em `supabase/migrations/*_funcoes.sql`.
- Quem barra acesso é o banco (RLS + funções). O menu do app só esconde o que a pessoa não usa.
- Custo, margem e comissão de terceiros não aparecem para representante nem produção. Não colocar custos nem dados de clientes em arquivos do repositório.
- Migração aplicada em produção não se altera: cria-se uma nova.
- Texto de interface em português, na voz da marca: frases curtas, ponto final, sem exclamação.

## Comandos

- `npm run dev`: app local (precisa de `.env.local`, modelo em `.env.example`).
- `npm test`: sobe um Postgres em memória, aplica as migrações e testa regras e permissões.
- `npm run build`: checa tipos e gera `dist/`.
- `npx supabase db push`: aplica migrações novas no projeto Supabase ligado.
- `npm run publicar`: testa, compila e põe a versão no ar em https://vivanoz.github.io/app-consignado/ (GitHub Pages, branch `gh-pages`). O repositório é público: nada de segredo, custo ou dado de cliente em arquivo versionado.
