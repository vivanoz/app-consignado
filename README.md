# Viva Noz Consignado

Controle da operação em consignação da Viva Noz: o que está com cada representante, o que ficou em cada loja, o que foi vendido e reposto em cada visita, quanto cada loja deve e o que já foi pago.

## Como está montado

| Parte | Onde | O que faz |
|---|---|---|
| App | `src/` | React + Vite + Tailwind. Feito para o celular, instalável (PWA). |
| Banco | `supabase/migrations/` | Postgres no Supabase: tabelas, permissões por perfil e funções de lançamento. |
| Testes | `tests/` | Aplicam as migrações em um Postgres em memória e conferem regras e permissões. |

### Perfis de acesso

| Perfil | Enxerga e faz |
|---|---|
| Gestão | Tudo: cadastros, preços, equipe, confirmação de Pix, estorno de visita. |
| Produção | Estoque dos representantes, retirada e devolução. Não vê lojas, preços nem acertos. |
| Representante | Suas lojas, seu estoque, suas visitas e seus acertos. Não vê custos nem dados de outros representantes. |

Qualquer pessoa cria a conta em **Primeiro acesso**, mas ela nasce bloqueada e não enxerga nada. A gestão escolhe o perfil e libera em **Mais > Equipe e acessos**.

### Regras que o banco garante

- Saldo é a soma das movimentações (`fábrica → representante → loja → vendido`), nunca um número digitado.
- Em cada visita: `vendido = saldo anterior − encontrado` e `fica = encontrado − recolhido − baixa + reposto`.
- O acerto grava o preço vigente na data da visita. Mudar a tabela depois não muda acertos antigos.
- Só a gestão confirma pagamento, e só com o valor exato do acerto.
- Lançamento não se edita nem se apaga. Erro se corrige com estorno, que fica no histórico.
- Reenviar o mesmo lançamento (internet ruim) não duplica nada.
- Confirmar o Pix de uma loja gera a comissão do representante, com vencimento no 5º dia útil do mês seguinte. O bônus de abertura sai no segundo acerto pago da loja.
- O pagamento ao representante agrupa comissões, soma o valor e guarda o comprovante.

## Rodar no computador

```bash
npm install
npm test
```

Para abrir o app é preciso um projeto Supabase. Copie `.env.example` para `.env.local`, preencha e rode:

```bash
npm run dev
```

## Colocar o banco no ar (uma vez)

1. Criar o projeto no Supabase com a conta da Viva Noz.
2. `npx supabase login` e `npx supabase link --project-ref <ref do projeto>`.
3. `npx supabase db push` aplica as migrações.
4. `npx supabase config push` aplica a configuração de login (aceite só a parte de auth).
5. A primeira pessoa cria a conta no app ("Primeiro acesso") e vira gestão pelo SQL Editor:

```sql
update public.perfis set papel = 'gestao', ativo = true where email = 'email-da-pessoa';
```

Daí em diante, os demais acessos são liberados pelo próprio app.

## Publicar uma versão nova

```bash
npm run publicar
```

Roda os testes, compila e envia para o GitHub Pages: https://vivanoz.github.io/app-consignado/

## Fora desta versão

Estoque da fábrica e de insumos, contagem mensal do estoque do representante com desconto, pagamento parcial de acerto, e-mails próprios (exigem serviço de envio).
