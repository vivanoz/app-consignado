-- Viva Noz Consignado · 13 · Matérias-primas
--
-- Controle do que entra para virar pacote: castanhas, embalagem e adesivos.
--   - Fornecedores e compras, com valores (só a gestão vê valores).
--   - Receita: quanto de cada insumo vai em um pacote de cada produto.
--   - Ao registrar produção, o sistema desconta os insumos pela receita.
--   - Estoque ideal por insumo; abaixo de 30% do ideal, sinaliza compra.
-- O saldo de cada insumo é a soma das movimentações, como no produto pronto.
-- Nada disto aparece para representante.

create type public.insumo_unidade as enum ('g', 'un');
create type public.insumo_mov_tipo as enum ('saldo_inicial', 'compra', 'consumo', 'ajuste');
-- A embalagem muda conforme o destino do pacote: loja (consignado e compra
-- direta) leva adesivo de logo e tabela nutricional; varejo leva outro adesivo.
create type public.receita_canal as enum ('todos', 'loja', 'varejo');

create table public.fornecedores (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  contato_nome  text,
  telefone      text,
  email         text,
  cidade        text,
  observacoes   text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.insumos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  unidade       public.insumo_unidade not null,
  -- Quanto a gestão quer ter em casa. O mínimo é 30% disso.
  estoque_ideal numeric(14, 3) not null default 0 check (estoque_ideal >= 0),
  fornecedor_id uuid references public.fornecedores (id),
  ordem         integer not null default 0,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Quanto de um insumo vai em um pacote do produto, por destino.
create table public.receitas (
  id         uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos (id),
  insumo_id  uuid not null references public.insumos (id),
  canal      public.receita_canal not null default 'todos',
  quantidade numeric(12, 3) not null check (quantidade > 0),
  unique (produto_id, insumo_id, canal)
);

create table public.compras (
  id             uuid primary key,
  fornecedor_id  uuid references public.fornecedores (id),
  comprada_em    date not null,
  valor_frete    numeric(12, 2) not null default 0 check (valor_frete >= 0),
  valor_total    numeric(12, 2) not null check (valor_total >= 0),
  observacoes    text,
  registrado_por uuid not null references public.perfis (id),
  criado_em      timestamptz not null default now()
);

create table public.compra_itens (
  compra_id  uuid not null references public.compras (id),
  insumo_id  uuid not null references public.insumos (id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  valor      numeric(12, 2) not null check (valor >= 0),
  primary key (compra_id, insumo_id)
);

-- Quantidade com sinal: compra e sobra entram positivas; consumo e falta, negativas.
create table public.insumo_movimentacoes (
  id             uuid primary key default gen_random_uuid(),
  operacao_id    uuid not null,
  insumo_id      uuid not null references public.insumos (id),
  tipo           public.insumo_mov_tipo not null,
  quantidade     numeric(14, 3) not null check (quantidade <> 0),
  compra_id      uuid references public.compras (id),
  lote_id        uuid references public.lotes_producao (id),
  motivo         text,
  ocorrido_em    timestamptz not null default now(),
  registrado_por uuid not null references public.perfis (id),
  criado_em      timestamptz not null default now()
);

create index insumo_movimentacoes_insumo on public.insumo_movimentacoes (insumo_id);
create index insumo_movimentacoes_operacao on public.insumo_movimentacoes (operacao_id);

-- O lote guarda para que destino foi embalado.
alter table public.lotes_producao
  add column canal public.receita_canal not null default 'loja' check (canal <> 'todos');

create trigger fornecedores_atualizacao before update on public.fornecedores
  for each row execute function app.marca_atualizacao();
create trigger insumos_atualizacao before update on public.insumos
  for each row execute function app.marca_atualizacao();
create trigger fornecedores_auditoria after insert or update or delete on public.fornecedores
  for each row execute function app.auditar();
create trigger insumos_auditoria after insert or update or delete on public.insumos
  for each row execute function app.auditar();
create trigger receitas_auditoria after insert or update or delete on public.receitas
  for each row execute function app.auditar();
create trigger compras_imutavel before update or delete on public.compras
  for each row execute function app.imutavel();
create trigger compra_itens_imutavel before update or delete on public.compra_itens
  for each row execute function app.imutavel();
create trigger insumo_movimentacoes_imutavel before update or delete on public.insumo_movimentacoes
  for each row execute function app.imutavel();

-- Situação de cada insumo: saldo, mínimo (30% do ideal) e se é hora de comprar.
create view public.insumos_situacao with (security_invoker = true) as
  select i.id, i.nome, i.unidade, i.estoque_ideal, i.fornecedor_id, i.ordem, i.ativo,
         coalesce(m.saldo, 0) as saldo,
         round(i.estoque_ideal * 0.30, 3) as estoque_minimo,
         (i.ativo and i.estoque_ideal > 0 and coalesce(m.saldo, 0) <= i.estoque_ideal * 0.30) as comprar,
         greatest(i.estoque_ideal - coalesce(m.saldo, 0), 0) as falta_para_o_ideal
  from public.insumos i
  left join (
    select insumo_id, sum(quantidade) as saldo from public.insumo_movimentacoes group by insumo_id
  ) m on m.insumo_id = i.id;

create function app.saldo_insumo(p_insumo_id uuid) returns numeric
language sql stable security definer
set search_path = ''
as $$
  select coalesce(sum(quantidade), 0) from public.insumo_movimentacoes where insumo_id = p_insumo_id
$$;

-- Produção: além de entrar o pacote pronto na fábrica, desconta os insumos
-- da receita. Substitui a função da migração 04 (ganhou o destino do lote).
drop function public.registrar_producao(uuid, uuid, integer, date, date, text);

create function public.registrar_producao(
  p_operacao_id uuid, p_produto_id uuid, p_quantidade integer,
  p_produzido_em date default null, p_validade date default null, p_observacoes text default null,
  p_canal public.receita_canal default 'loja'
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_lote uuid;
begin
  if coalesce(app.papel() in ('gestao', 'producao'), false) is not true then
    raise exception 'Só a gestão ou a produção registram lotes.';
  end if;
  if p_operacao_id is null then raise exception 'Operação sem identificador.'; end if;
  if exists (select 1 from public.movimentacoes where operacao_id = p_operacao_id) then
    return jsonb_build_object('operacao_id', p_operacao_id, 'repetida', true);
  end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Informe a quantidade produzida.'; end if;
  if p_canal = 'todos' then raise exception 'Informe se o lote é para loja ou para varejo.'; end if;
  if not exists (select 1 from public.produtos where id = p_produto_id and ativo) then
    raise exception 'Produto não encontrado.';
  end if;

  insert into public.lotes_producao (produto_id, quantidade, produzido_em, validade, observacoes, registrado_por, canal)
  values (p_produto_id, p_quantidade, coalesce(p_produzido_em, app.hoje()), p_validade, p_observacoes, v_uid, p_canal)
  returning id into v_lote;

  perform app.movimenta(p_operacao_id, 'producao', p_produto_id, p_quantidade, 'producao', 'fabrica',
    null, null, null, v_lote, p_observacoes, now(), v_uid);

  -- Baixa dos insumos. Se faltar insumo no app, o saldo fica negativo e a
  -- tela de insumos avisa: a produção já aconteceu, não faz sentido barrar.
  insert into public.insumo_movimentacoes (operacao_id, insumo_id, tipo, quantidade, lote_id, registrado_por)
  select p_operacao_id, r.insumo_id, 'consumo', -(sum(r.quantidade) * p_quantidade), v_lote, v_uid
  from public.receitas r
  where r.produto_id = p_produto_id and r.canal in ('todos', p_canal)
  group by r.insumo_id;

  return jsonb_build_object('operacao_id', p_operacao_id, 'lote_id', v_lote, 'repetida', false);
end;
$$;

-- Compra de insumos. p_itens: [{insumo_id, quantidade, valor}], com a
-- quantidade na unidade do insumo (gramas ou unidades) e o valor total do item.
create function public.registrar_compra(
  p_id uuid, p_fornecedor_id uuid, p_itens jsonb,
  p_comprada_em date default null, p_valor_frete numeric default 0, p_observacoes text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_data  date := coalesce(p_comprada_em, app.hoje());
  v_frete numeric(12, 2) := coalesce(p_valor_frete, 0);
  v_total numeric(12, 2);
begin
  if not app.eh_gestao() then raise exception 'Só a gestão registra compras.'; end if;
  if p_id is null then raise exception 'Compra sem identificador.'; end if;
  if exists (select 1 from public.compras where id = p_id) then
    return (select jsonb_build_object('compra_id', c.id, 'valor_total', c.valor_total, 'repetida', true) from public.compras c where c.id = p_id);
  end if;
  if v_data > app.hoje() then raise exception 'A data da compra não pode estar no futuro.'; end if;
  if v_frete < 0 then raise exception 'Frete inválido.'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um insumo comprado.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_itens) as x(insumo_id uuid, quantidade numeric, valor numeric)
    left join public.insumos i on i.id = x.insumo_id
    where i.id is null or x.quantidade is null or x.quantidade <= 0 or x.valor is null or x.valor < 0
  ) or (select count(*) <> count(distinct x.insumo_id) from jsonb_to_recordset(p_itens) as x(insumo_id uuid)) then
    raise exception 'Há insumo desconhecido, repetido ou com quantidade ou valor inválido.';
  end if;

  select sum(x.valor) + v_frete into v_total
  from jsonb_to_recordset(p_itens) as x(insumo_id uuid, quantidade numeric, valor numeric);

  insert into public.compras (id, fornecedor_id, comprada_em, valor_frete, valor_total, observacoes, registrado_por)
  values (p_id, p_fornecedor_id, v_data, v_frete, v_total, nullif(trim(p_observacoes), ''), v_uid);

  insert into public.compra_itens (compra_id, insumo_id, quantidade, valor)
  select p_id, x.insumo_id, x.quantidade, x.valor
  from jsonb_to_recordset(p_itens) as x(insumo_id uuid, quantidade numeric, valor numeric);

  insert into public.insumo_movimentacoes (operacao_id, insumo_id, tipo, quantidade, compra_id, registrado_por)
  select p_id, x.insumo_id, 'compra', x.quantidade, p_id, v_uid
  from jsonb_to_recordset(p_itens) as x(insumo_id uuid, quantidade numeric, valor numeric);

  return jsonb_build_object('compra_id', p_id, 'valor_total', v_total, 'repetida', false);
end;
$$;

-- Contagem física: a pessoa informa quanto tem de verdade e o sistema lança
-- a diferença. É assim que se registra o estoque atual pela primeira vez.
create function public.registrar_contagem_insumo(
  p_operacao_id uuid, p_insumo_id uuid, p_quantidade_contada numeric, p_motivo text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_saldo    numeric;
  v_primeira boolean;
begin
  if coalesce(app.papel() in ('gestao', 'producao'), false) is not true then
    raise exception 'Só a gestão ou a produção registram contagem de insumos.';
  end if;
  if p_operacao_id is null then raise exception 'Operação sem identificador.'; end if;
  if exists (select 1 from public.insumo_movimentacoes where operacao_id = p_operacao_id) then
    return jsonb_build_object('operacao_id', p_operacao_id, 'repetida', true);
  end if;
  if p_quantidade_contada is null or p_quantidade_contada < 0 then raise exception 'Quantidade contada inválida.'; end if;
  perform 1 from public.insumos where id = p_insumo_id for update;
  if not found then raise exception 'Insumo não encontrado.'; end if;

  v_saldo := app.saldo_insumo(p_insumo_id);
  v_primeira := not exists (select 1 from public.insumo_movimentacoes where insumo_id = p_insumo_id);

  if p_quantidade_contada <> v_saldo then
    insert into public.insumo_movimentacoes (operacao_id, insumo_id, tipo, quantidade, motivo, registrado_por)
    values (p_operacao_id, p_insumo_id, case when v_primeira then 'saldo_inicial' else 'ajuste' end::public.insumo_mov_tipo,
            p_quantidade_contada - v_saldo, coalesce(nullif(trim(p_motivo), ''), 'Contagem física'), v_uid);
  end if;

  return jsonb_build_object('operacao_id', p_operacao_id, 'saldo_anterior', v_saldo, 'saldo', p_quantidade_contada, 'repetida', false);
end;
$$;

alter table public.fornecedores enable row level security;
alter table public.insumos enable row level security;
alter table public.receitas enable row level security;
alter table public.compras enable row level security;
alter table public.compra_itens enable row level security;
alter table public.insumo_movimentacoes enable row level security;

-- Fornecedores e compras (com valores): só gestão.
create policy fornecedores_gestao_ver on public.fornecedores for select to authenticated using ((select app.eh_gestao()));
create policy fornecedores_gestao_insere on public.fornecedores for insert to authenticated with check ((select app.eh_gestao()));
create policy fornecedores_gestao_altera on public.fornecedores for update to authenticated
  using ((select app.eh_gestao())) with check ((select app.eh_gestao()));
create policy compras_gestao_ver on public.compras for select to authenticated using ((select app.eh_gestao()));
create policy compra_itens_gestao_ver on public.compra_itens for select to authenticated using ((select app.eh_gestao()));

-- Insumos, receitas e quantidades em estoque: gestão cuida; produção consulta.
create policy insumos_ver on public.insumos for select to authenticated
  using ((select app.papel()) in ('gestao', 'producao'));
create policy insumos_gestao_insere on public.insumos for insert to authenticated with check ((select app.eh_gestao()));
create policy insumos_gestao_altera on public.insumos for update to authenticated
  using ((select app.eh_gestao())) with check ((select app.eh_gestao()));

create policy receitas_ver on public.receitas for select to authenticated
  using ((select app.papel()) in ('gestao', 'producao'));
create policy receitas_gestao_insere on public.receitas for insert to authenticated with check ((select app.eh_gestao()));
create policy receitas_gestao_altera on public.receitas for update to authenticated
  using ((select app.eh_gestao())) with check ((select app.eh_gestao()));
create policy receitas_gestao_remove on public.receitas for delete to authenticated using ((select app.eh_gestao()));

create policy insumo_movimentacoes_ver on public.insumo_movimentacoes for select to authenticated
  using ((select app.papel()) in ('gestao', 'producao'));

revoke all on public.fornecedores, public.insumos, public.receitas, public.compras, public.compra_itens,
  public.insumo_movimentacoes, public.insumos_situacao from anon, authenticated;
grant select, insert, update on public.fornecedores, public.insumos to authenticated;
grant select, insert, update, delete on public.receitas to authenticated;
grant select on public.compras, public.compra_itens, public.insumo_movimentacoes, public.insumos_situacao to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema app to authenticated;

-- ───────────────────────── Dados iniciais ─────────────────────────
-- Insumos que a Viva Noz compra hoje e a receita de cada pacote de 100 g.
-- Estoque ideal começa em zero: a gestão define no app.

insert into public.insumos (nome, unidade, ordem) values
  ('Castanha de caju torrada sem sal W1',       'g',  1),
  ('Castanha de caju com sal W1',               'g',  2),
  ('Castanha de caju caramelizada com gergelim', 'g', 3),
  ('Nozes Quartz',                              'g',  4),
  ('Amêndoa torrada',                           'g',  5),
  ('Castanha-do-pará',                          'g',  6),
  ('Cranberry',                                 'g',  7),
  ('Embalagem kraft 100 g',                     'un', 8),
  ('Adesivo logo central (consignado e direto)', 'un', 9),
  ('Adesivo tabela nutricional (consignado e direto)', 'un', 10),
  ('Adesivo varejo',                            'un', 11);

insert into public.receitas (produto_id, insumo_id, canal, quantidade)
select p.id, i.id, r.canal::public.receita_canal, r.quantidade
from (values
  ('MIX-100',  'Castanha de caju torrada sem sal W1',        'todos', 22),
  ('MIX-100',  'Nozes Quartz',                               'todos', 27),
  ('MIX-100',  'Amêndoa torrada',                            'todos', 20),
  ('MIX-100',  'Castanha-do-pará',                           'todos', 18),
  ('MIX-100',  'Cranberry',                                  'todos', 13),
  ('CAR-100',  'Castanha de caju caramelizada com gergelim', 'todos', 100),
  ('CAJU-100', 'Castanha de caju com sal W1',                'todos', 100)
) as r(sku, insumo, canal, quantidade)
join public.produtos p on p.sku = r.sku
join public.insumos i on i.nome = r.insumo;

-- Embalagem e adesivos: iguais para os três produtos.
insert into public.receitas (produto_id, insumo_id, canal, quantidade)
select p.id, i.id, e.canal::public.receita_canal, 1
from public.produtos p
cross join (values
  ('Embalagem kraft 100 g',                            'todos'),
  ('Adesivo logo central (consignado e direto)',       'loja'),
  ('Adesivo tabela nutricional (consignado e direto)', 'loja'),
  ('Adesivo varejo',                                   'varejo')
) as e(insumo, canal)
join public.insumos i on i.nome = e.insumo;
