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
- Comissão nasce quando a gestão confirma o Pix da loja e vence no 5º dia útil (segunda a sexta, fora `feriados`) do mês seguinte ao do Pix. Pagamento ao representante é um repasse que agrupa comissões.
- Fotos e comprovantes ficam no Storage, em espaços privados; a pasta do arquivo (`lojas/<id>/…`, `acertos/<id>/…`) define quem pode ver.
- Venda varejo (na rua) baixa o estoque de quem vendeu, fatura pelo preço médio de varejo da tabela e abre acerto: o dinheiro está com quem vendeu até a gestão confirmar.
- Amostra só vai para potencial cliente (`prospectos`): sai do estoque, sem acerto nem comissão.
- Matéria-prima: produção desconta insumos pela receita do produto e pelo destino do lote (loja ou varejo). Abaixo de 30% do estoque ideal, sinaliza compra. Valores de compra e fornecedores são só da gestão.
- DRE (competência) e fluxo de caixa (caixa) saem da função `financeiro_mensal`, só para a gestão. Custo do pacote = receita x custo médio das compras de cada insumo. Despesas, impostos, aportes e retiradas ficam em `lancamentos`.
- CRM: lead (`prospectos`) anda pelo funil novo > em contato > amostra > negociando > cliente; `interacoes` é histórico (não se edita); `atividades` são lembretes com responsável. Cada visita fecha o lembrete de reposição da loja e abre o próximo em `lojas.dias_reposicao` dias.
- Antes de mostrar algo novo, decidir o que cada perfil vê. Representante tem visão operacional: suas lojas, potenciais, estoque, visitas, vendas e comissões. Nada de custo, compra, fornecedor, receita ou dado de outro representante.
- Em função do banco, comparação com `app.meu_representante_id()` dentro de `if not (...)` precisa de `coalesce(..., false)`: quem não tem cadastro de representante devolve nulo e o `if` não barra.
- Texto de interface em português, na voz da marca: frases curtas, ponto final, sem exclamação.

## Comandos

- `npm run dev`: app local (precisa de `.env.local`, modelo em `.env.example`).
- `npm test`: sobe um Postgres em memória, aplica as migrações e testa regras e permissões.
- `npm run build`: checa tipos e gera `dist/`.
- `npx supabase db push`: aplica migrações novas no projeto Supabase ligado.
- `npx supabase functions deploy criar-usuario --use-api`: publica a função que a gestão usa para criar usuários.
- `npm run publicar`: testa, compila e põe a versão no ar em https://vivanoz.github.io/app-consignado/ (GitHub Pages, branch `gh-pages`). O repositório é público: nada de segredo, custo ou dado de cliente em arquivo versionado.
