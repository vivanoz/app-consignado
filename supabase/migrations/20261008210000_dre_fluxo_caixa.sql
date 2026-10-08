-- Viva Noz Consignado · 15 · DRE e fluxo de caixa (só gestão)
--
-- Quase tudo já está no sistema: vendas (acertos), recebimentos (pagamentos),
-- comissões, repasses, compras de insumos, amostras e perdas. Faltam duas
-- coisas, que entram aqui:
--   1. Custo de cada pacote, pela receita e pelo custo médio das compras.
--   2. Lançamentos que não nascem de nenhuma operação do app: despesas,
--      impostos, aportes e retiradas dos sócios.
-- A função financeiro_mensal devolve os números por mês, nos dois regimes:
-- competência (DRE) e caixa (fluxo de caixa).

-- Custo médio de cada insumo: tudo o que já foi pago, com o frete rateado
-- pelo valor dos itens, dividido por tudo o que já foi comprado.
create view public.insumos_custo with (security_invoker = true) as
  select ci.insumo_id,
         sum(ci.valor + coalesce(c.valor_frete * ci.valor / nullif(t.itens, 0), 0)) / nullif(sum(ci.quantidade), 0) as custo_unitario
  from public.compra_itens ci
  join public.compras c on c.id = ci.compra_id
  join (select compra_id, sum(valor) as itens from public.compra_itens group by compra_id) t on t.compra_id = c.id
  group by ci.insumo_id;

-- Custo de um pacote, por destino (a embalagem muda entre loja e varejo).
create view public.produtos_custo with (security_invoker = true) as
  select p.id as produto_id,
         coalesce(sum(r.quantidade * ic.custo_unitario) filter (where r.canal in ('todos', 'loja')), 0) as custo_loja,
         coalesce(sum(r.quantidade * ic.custo_unitario) filter (where r.canal in ('todos', 'varejo')), 0) as custo_varejo,
         count(*) filter (where r.id is not null and ic.custo_unitario is null) as insumos_sem_custo
  from public.produtos p
  left join public.receitas r on r.produto_id = p.id
  left join public.insumos_custo ic on ic.insumo_id = r.insumo_id
  group by p.id;

create type public.lancamento_tipo as enum ('despesa', 'imposto', 'aporte', 'retirada');

-- despesa e imposto entram no DRE pelo mês de competência e no caixa pelo
-- dia do pagamento. aporte e retirada são só de caixa.
create table public.lancamentos (
  id             uuid primary key default gen_random_uuid(),
  tipo           public.lancamento_tipo not null,
  categoria      text not null,
  descricao      text,
  valor          numeric(12, 2) not null check (valor > 0),
  competencia    date not null,
  pago_em        date,
  cancelado_em   timestamptz,
  registrado_por uuid references public.perfis (id) default auth.uid(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check (tipo in ('despesa', 'imposto') or pago_em is not null)
);

create index lancamentos_competencia on public.lancamentos (competencia);

create trigger lancamentos_atualizacao before update on public.lancamentos
  for each row execute function app.marca_atualizacao();
create trigger lancamentos_auditoria after insert or update or delete on public.lancamentos
  for each row execute function app.auditar();
create trigger lancamentos_sem_apagar before delete on public.lancamentos
  for each row execute function app.imutavel();

alter table public.lancamentos enable row level security;

create policy lancamentos_gestao_ver on public.lancamentos for select to authenticated using ((select app.eh_gestao()));
create policy lancamentos_gestao_insere on public.lancamentos for insert to authenticated with check ((select app.eh_gestao()));
create policy lancamentos_gestao_altera on public.lancamentos for update to authenticated
  using ((select app.eh_gestao())) with check ((select app.eh_gestao()));

revoke all on public.lancamentos, public.insumos_custo, public.produtos_custo from anon, authenticated;
grant select, insert, update on public.lancamentos to authenticated;
grant select on public.insumos_custo, public.produtos_custo to authenticated;

create function public.financeiro_mensal(p_meses integer default 6) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_fim    date := date_trunc('month', app.hoje())::date;
  v_inicio date;
  v_meses  jsonb;
begin
  if not app.eh_gestao() then raise exception 'Só a gestão vê o financeiro.'; end if;
  v_inicio := (v_fim - make_interval(months => greatest(least(coalesce(p_meses, 6), 24), 1) - 1))::date;

  with meses as (
    select generate_series(v_inicio::timestamp, v_fim::timestamp, interval '1 month')::date as mes
  ),
  -- Venda pelo mês em que aconteceu: dia da visita ou dia da venda na rua.
  vendas as (
    select date_trunc('month', coalesce(vv.vendida_em, (v.realizada_em at time zone 'America/Sao_Paulo')::date))::date as mes,
           a.modalidade, ai.quantidade, ai.subtotal,
           ai.quantidade * coalesce(case when a.modalidade = 'varejo' then c.custo_varejo else c.custo_loja end, 0) as custo
    from public.acertos a
    join public.acerto_itens ai on ai.acerto_id = a.id
    left join public.visitas v on v.id = a.visita_id
    left join public.vendas_varejo vv on vv.id = a.venda_varejo_id
    left join public.produtos_custo c on c.produto_id = ai.produto_id
    where a.status <> 'cancelado'
  ),
  recebimentos as (
    select date_trunc('month', pg.recebido_em)::date as mes, a.modalidade, pg.valor
    from public.pagamentos pg join public.acertos a on a.id = pg.acerto_id
  ),
  lanc as (
    select * from public.lancamentos where cancelado_em is null
  )
  select jsonb_agg(jsonb_build_object(
    'mes', m.mes,
    -- Competência (DRE)
    'receita_lojas',  (select coalesce(sum(subtotal), 0) from vendas where mes = m.mes and modalidade in ('kit_teste', 'consignado')),
    'receita_direta', (select coalesce(sum(subtotal), 0) from vendas where mes = m.mes and modalidade = 'compra_direta'),
    'receita_varejo', (select coalesce(sum(subtotal), 0) from vendas where mes = m.mes and modalidade = 'varejo'),
    'pacotes',        (select coalesce(sum(quantidade), 0) from vendas where mes = m.mes),
    'cmv',            (select round(coalesce(sum(custo), 0), 2) from vendas where mes = m.mes),
    'impostos',       (select coalesce(sum(valor), 0) from lanc where tipo = 'imposto' and date_trunc('month', competencia)::date = m.mes),
    'comissoes',      (select coalesce(sum(valor), 0) from public.comissoes where date_trunc('month', recebido_em)::date = m.mes),
    'amostras',       (select round(coalesce(sum(ai.quantidade * coalesce(c.custo_loja, 0)), 0), 2)
                       from public.amostras am join public.amostra_itens ai on ai.amostra_id = am.id
                       left join public.produtos_custo c on c.produto_id = ai.produto_id
                       where date_trunc('month', am.entregue_em)::date = m.mes),
    'amostras_pacotes', (select coalesce(sum(ai.quantidade), 0) from public.amostras am join public.amostra_itens ai on ai.amostra_id = am.id
                         where date_trunc('month', am.entregue_em)::date = m.mes),
    'perdas',         (select round(coalesce(sum(mv.quantidade * coalesce(c.custo_loja, 0)), 0), 2)
                       from public.movimentacoes mv left join public.produtos_custo c on c.produto_id = mv.produto_id
                       where mv.tipo = 'baixa' and date_trunc('month', (mv.ocorrido_em at time zone 'America/Sao_Paulo')::date)::date = m.mes),
    'despesas',       (select coalesce(jsonb_object_agg(d.categoria, d.total), '{}'::jsonb)
                       from (select categoria, sum(valor) as total from lanc
                             where tipo = 'despesa' and date_trunc('month', competencia)::date = m.mes group by categoria) d),
    -- Caixa
    'cx_lojas',     (select coalesce(sum(valor), 0) from recebimentos where mes = m.mes and modalidade <> 'varejo'),
    'cx_varejo',    (select coalesce(sum(valor), 0) from recebimentos where mes = m.mes and modalidade = 'varejo'),
    'cx_aportes',   (select coalesce(sum(valor), 0) from lanc where tipo = 'aporte' and date_trunc('month', pago_em)::date = m.mes),
    'cx_compras',   (select coalesce(sum(valor_total), 0) from public.compras where date_trunc('month', comprada_em)::date = m.mes),
    'cx_repasses',  (select coalesce(sum(valor_total), 0) from public.repasses where date_trunc('month', pago_em)::date = m.mes),
    'cx_despesas',  (select coalesce(sum(valor), 0) from lanc where tipo = 'despesa' and date_trunc('month', pago_em)::date = m.mes),
    'cx_impostos',  (select coalesce(sum(valor), 0) from lanc where tipo = 'imposto' and date_trunc('month', pago_em)::date = m.mes),
    'cx_retiradas', (select coalesce(sum(valor), 0) from lanc where tipo = 'retirada' and date_trunc('month', pago_em)::date = m.mes)
  ) order by m.mes)
  into v_meses
  from meses m;

  return jsonb_build_object(
    'meses', v_meses,
    -- Caixa acumulado antes do primeiro mês mostrado.
    'saldo_anterior',
        (select coalesce(sum(valor), 0) from public.pagamentos where recebido_em < v_inicio)
      + (select coalesce(sum(case when tipo = 'aporte' then valor else -valor end), 0) from public.lancamentos
         where cancelado_em is null and pago_em < v_inicio)
      - (select coalesce(sum(valor_total), 0) from public.compras where comprada_em < v_inicio)
      - (select coalesce(sum(valor_total), 0) from public.repasses where pago_em < v_inicio),
    -- O que ainda vai virar caixa.
    'a_receber',          (select coalesce(sum(valor_total), 0) from public.acertos where status = 'pendente'),
    'a_pagar_comissoes',  (select coalesce(sum(valor), 0) from public.comissoes where status = 'pendente'),
    'a_pagar_despesas',   (select coalesce(sum(valor), 0) from public.lancamentos
                           where cancelado_em is null and tipo in ('despesa', 'imposto') and pago_em is null),
    -- Custo por pacote, para explicar o CMV.
    'custos', (select coalesce(jsonb_agg(jsonb_build_object(
                 'produto_id', c.produto_id, 'custo_loja', round(c.custo_loja, 2), 'custo_varejo', round(c.custo_varejo, 2),
                 'insumos_sem_custo', c.insumos_sem_custo)), '[]'::jsonb)
               from public.produtos_custo c join public.produtos p on p.id = c.produto_id where p.ativo)
  );
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
