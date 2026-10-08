-- Viva Noz Consignado · 09 · Venda varejo
--
-- Venda direta ao consumidor, na rua, feita por quem tem estoque em mãos
-- (representante ou alguém da gestão que também vende). No fim do dia a
-- pessoa informa quantos pacotes de cada sabor vendeu. O sistema:
--   - baixa do estoque dela (representante -> vendido);
--   - calcula o faturamento pelo preço médio de varejo vigente;
--   - abre um acerto: o dinheiro está com quem vendeu e precisa chegar à
--     Viva Noz. Quando a gestão confirma, nasce a comissão, como nas lojas.

-- Loja nunca é "varejo": essa modalidade é só de preço e de acerto.
alter table public.lojas add constraint lojas_sem_varejo check (modalidade <> 'varejo');

-- Comissão própria para o varejo. Nasce igual à do consignado (o combinado
-- é pagar os mesmos 15%); quem tinha zero continua com zero.
alter table public.representante_condicoes
  add column comissao_varejo numeric(5, 4) not null default 0.15 check (comissao_varejo between 0 and 1);

alter table public.representante_condicoes disable trigger condicoes_imutavel;
update public.representante_condicoes set comissao_varejo = comissao_consignado;
alter table public.representante_condicoes enable trigger condicoes_imutavel;

create table public.vendas_varejo (
  id               uuid primary key,
  representante_id uuid not null references public.representantes (id),
  vendida_em       date not null,
  observacoes      text,
  registrado_por   uuid not null references public.perfis (id),
  criado_em        timestamptz not null default now(),
  estornada_em     timestamptz,
  estornada_por    uuid references public.perfis (id),
  estorno_motivo   text
);

create index vendas_varejo_representante on public.vendas_varejo (representante_id, vendida_em desc);

create trigger vendas_varejo_sem_apagar before delete on public.vendas_varejo
  for each row execute function app.imutavel();

-- O acerto passa a nascer de uma visita a loja ou de uma venda varejo.
alter table public.acertos
  alter column visita_id drop not null,
  alter column loja_id drop not null,
  add column venda_varejo_id uuid unique references public.vendas_varejo (id),
  add constraint acertos_origem check (
    (visita_id is not null and loja_id is not null and venda_varejo_id is null)
    or (visita_id is null and loja_id is null and venda_varejo_id is not null)
  );

alter table public.comissoes alter column loja_id drop not null;

-- Preço médio do varejo: R$ 15,00 por pacote. A gestão muda na tabela de
-- preços, lançando um novo valor com data.
insert into public.precos (produto_id, modalidade, preco_loja, vigente_desde)
select p.id, 'varejo', 15.00, date '2026-10-01' from public.produtos p;

create or replace function app.gera_comissoes(p_acerto_id uuid, p_recebido_em date) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_acerto     public.acertos;
  v_cond       public.representante_condicoes;
  v_percentual numeric(5, 4);
  v_valor      numeric(12, 2);
  v_vencimento date := public.vencimento_comissao(p_recebido_em);
begin
  select * into v_acerto from public.acertos where id = p_acerto_id;

  select * into v_cond from public.representante_condicoes
  where representante_id = v_acerto.representante_id and vigente_desde <= p_recebido_em
  order by vigente_desde desc, criado_em desc limit 1;
  if not found then return; end if;

  v_percentual := case v_acerto.modalidade
    when 'compra_direta' then v_cond.comissao_direta
    when 'varejo' then v_cond.comissao_varejo
    else v_cond.comissao_consignado
  end;
  v_valor := round(v_acerto.valor_total * v_percentual, 2);
  if v_valor > 0 then
    insert into public.comissoes (representante_id, tipo, acerto_id, loja_id, base, percentual, valor, recebido_em, vencimento)
    values (v_acerto.representante_id, 'comissao', p_acerto_id, v_acerto.loja_id, v_acerto.valor_total, v_percentual, v_valor, p_recebido_em, v_vencimento);
  end if;

  -- Bônus de abertura: só para lojas, liberado no segundo acerto pago.
  if v_acerto.loja_id is not null
     and v_cond.bonus_abertura > 0
     and (select count(*) from public.acertos where loja_id = v_acerto.loja_id and status = 'confirmado') = 2
     and not exists (select 1 from public.comissoes where loja_id = v_acerto.loja_id and tipo = 'bonus_abertura') then
    insert into public.comissoes (representante_id, tipo, acerto_id, loja_id, valor, recebido_em, vencimento)
    values (v_acerto.representante_id, 'bonus_abertura', p_acerto_id, v_acerto.loja_id, v_cond.bonus_abertura, p_recebido_em, v_vencimento);
  end if;
end;
$$;

-- p_itens: [{produto_id, quantidade}]
create function public.registrar_venda_varejo(
  p_id uuid, p_representante_id uuid, p_itens jsonb,
  p_vendida_em date default null, p_observacoes text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_data   date := coalesce(p_vendida_em, app.hoje());
  v_item   record;
  v_saldo  integer;
  v_preco  numeric(10, 2);
  v_total  numeric(12, 2) := 0;
  v_acerto uuid := gen_random_uuid();
begin
  if not app.ativo() then raise exception 'Acesso não autorizado.'; end if;
  if p_id is null then raise exception 'Venda sem identificador.'; end if;

  if exists (select 1 from public.vendas_varejo where id = p_id) then
    return (
      select jsonb_build_object('venda_id', v.id, 'acerto_id', a.id, 'valor_total', a.valor_total, 'repetida', true)
      from public.vendas_varejo v join public.acertos a on a.venda_varejo_id = v.id
      where v.id = p_id
    );
  end if;

  if not (app.eh_gestao() or coalesce(p_representante_id = app.meu_representante_id(), false)) then
    raise exception 'Você só registra as suas próprias vendas.';
  end if;
  perform 1 from public.representantes where id = p_representante_id and ativo for update;
  if not found then raise exception 'Representante não encontrado ou inativo.'; end if;
  if v_data > app.hoje() then raise exception 'A data da venda não pode estar no futuro.'; end if;

  insert into public.vendas_varejo (id, representante_id, vendida_em, observacoes, registrado_por)
  values (p_id, p_representante_id, v_data, nullif(trim(p_observacoes), ''), v_uid);

  -- Primeiro confere estoque e preço de tudo e soma o total; só depois grava.
  for v_item in select * from app.itens_quantidade(p_itens) loop
    v_saldo := app.saldo_representante(p_representante_id, v_item.produto_id);
    if v_item.quantidade > v_saldo then
      raise exception '%: o estoque no app é de % e a venda é de %. Registre a retirada na fábrica antes.',
        v_item.nome_curto, v_saldo, v_item.quantidade;
    end if;
    v_preco := public.preco_vigente(v_item.produto_id, 'varejo', v_data);
    if v_preco is null then
      raise exception '% não tem preço de varejo cadastrado. Peça à gestão para cadastrar.', v_item.nome_curto;
    end if;
    v_total := v_total + v_item.quantidade * v_preco;
  end loop;

  if v_total = 0 then raise exception 'Informe ao menos um produto vendido.'; end if;

  insert into public.acertos (id, venda_varejo_id, representante_id, modalidade, valor_total)
  values (v_acerto, p_id, p_representante_id, 'varejo', v_total);

  for v_item in select * from app.itens_quantidade(p_itens) loop
    v_preco := public.preco_vigente(v_item.produto_id, 'varejo', v_data);
    perform app.movimenta(p_id, 'venda_varejo', v_item.produto_id, v_item.quantidade, 'representante', 'vendido',
      p_representante_id, null, null, null, 'Venda varejo', now(), v_uid);
    insert into public.acerto_itens (acerto_id, produto_id, quantidade, preco_unitario, subtotal)
    values (v_acerto, v_item.produto_id, v_item.quantidade, v_preco, v_item.quantidade * v_preco);
  end loop;

  return jsonb_build_object('venda_id', p_id, 'acerto_id', v_acerto, 'valor_total', v_total, 'repetida', false);
end;
$$;

-- Gestão desfaz uma venda varejo lançada errada, enquanto não foi paga.
create function public.estornar_venda_varejo(p_venda_id uuid, p_motivo text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_venda public.vendas_varejo;
  v_mov   record;
begin
  if not app.eh_gestao() then raise exception 'Só a gestão estorna vendas.'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Explique o motivo do estorno.'; end if;

  select * into v_venda from public.vendas_varejo where id = p_venda_id for update;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if v_venda.estornada_em is not null then raise exception 'Esta venda já foi estornada.'; end if;
  if exists (select 1 from public.acertos where venda_varejo_id = p_venda_id and status = 'confirmado') then
    raise exception 'O dinheiro desta venda já foi confirmado e ela não pode ser estornada.';
  end if;

  for v_mov in select * from public.movimentacoes where operacao_id = p_venda_id and tipo = 'venda_varejo' loop
    perform app.movimenta(gen_random_uuid(), 'estorno', v_mov.produto_id, v_mov.quantidade, v_mov.destino, v_mov.origem,
      v_mov.representante_id, null, null, null, p_motivo, now(), v_uid);
  end loop;

  update public.vendas_varejo
  set estornada_em = now(), estornada_por = v_uid, estorno_motivo = trim(p_motivo)
  where id = p_venda_id;

  update public.acertos
  set status = 'cancelado', cancelado_em = now(), cancelado_por = v_uid, cancelado_motivo = trim(p_motivo)
  where venda_varejo_id = p_venda_id and status = 'pendente';

  return jsonb_build_object('venda_id', p_venda_id, 'estornada', true);
end;
$$;

alter table public.vendas_varejo enable row level security;

create policy vendas_varejo_ver on public.vendas_varejo for select to authenticated
  using ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()));

revoke all on public.vendas_varejo from anon, authenticated;
grant select on public.vendas_varejo to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema app to authenticated;
