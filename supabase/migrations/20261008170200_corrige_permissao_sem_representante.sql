-- Viva Noz Consignado · 10 · Correção de permissão
--
-- Quem não tem cadastro de representante (perfil produção, por exemplo) tem
-- app.meu_representante_id() nulo. A comparação "representante = nulo" dá
-- nulo, e "not (falso or nulo)" também: o "if" não barrava. Com isso essa
-- pessoa conseguia registrar visita em qualquer loja e trocar a foto de
-- qualquer representante. As duas funções abaixo são as mesmas de antes, com
-- a comparação protegida por coalesce(..., false).

create or replace function public.registrar_visita(
  p_id uuid, p_loja_id uuid, p_itens jsonb,
  p_observacoes text default null, p_realizada_em timestamptz default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_loja      public.lojas;
  v_quando    timestamptz := coalesce(p_realizada_em, now());
  v_direta    boolean;
  v_item      record;
  v_saldo_ant integer;
  v_saldo_rep integer;
  v_vendido   integer;
  v_final     integer;
  v_preco     numeric(10, 2);
  v_total     numeric(12, 2) := 0;
  v_cobranca  jsonb := '[]'::jsonb;
  v_acerto    uuid;
begin
  if not app.ativo() then raise exception 'Acesso não autorizado.'; end if;
  if p_id is null then raise exception 'Visita sem identificador.'; end if;

  if exists (select 1 from public.visitas where id = p_id) then
    return (
      select jsonb_build_object('visita_id', v.id, 'acerto_id', a.id,
                                'valor_total', coalesce(a.valor_total, 0), 'repetida', true)
      from public.visitas v left join public.acertos a on a.visita_id = v.id
      where v.id = p_id
    );
  end if;

  -- Trava a loja: duas visitas à mesma loja nunca são gravadas ao mesmo tempo.
  select * into v_loja from public.lojas where id = p_loja_id for update;
  if not found then raise exception 'Loja não encontrada.'; end if;
  if not (app.eh_gestao() or coalesce(v_loja.representante_id = app.meu_representante_id(), false)) then
    raise exception 'Esta loja é de outro representante.';
  end if;
  if v_loja.status <> 'ativa' then raise exception 'Esta loja não está ativa.'; end if;
  if v_quando > now() + interval '10 minutes' then
    raise exception 'A data da visita não pode estar no futuro.';
  end if;
  if exists (
    select 1 from public.visitas
    where loja_id = p_loja_id and estornada_em is null and realizada_em >= v_quando
  ) then
    raise exception 'Já existe uma visita a esta loja em data igual ou posterior.';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Lista de produtos inválida.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_itens) as x(produto_id uuid)
    left join public.produtos p on p.id = x.produto_id where p.id is null
  ) or (select count(*) <> count(distinct x.produto_id)
        from jsonb_to_recordset(p_itens) as x(produto_id uuid)) then
    raise exception 'Há produto desconhecido ou repetido na lista.';
  end if;

  -- Trava o representante: o estoque dele não muda no meio do lançamento.
  perform 1 from public.representantes where id = v_loja.representante_id for update;

  v_direta := v_loja.modalidade = 'compra_direta';

  insert into public.visitas (id, loja_id, representante_id, modalidade, realizada_em, observacoes, registrado_por)
  values (p_id, p_loja_id, v_loja.representante_id, v_loja.modalidade, v_quando, nullif(trim(p_observacoes), ''), v_uid);

  for v_item in
    select p.id as produto_id, p.nome_curto, p.ativo, (x.produto_id is not null) as informado,
           coalesce(x.encontrado, 0) as encontrado, coalesce(x.recolhido, 0) as recolhido,
           coalesce(x.baixado, 0) as baixado, coalesce(x.reposto, 0) as reposto
    from public.produtos p
    left join jsonb_to_recordset(p_itens)
      as x(produto_id uuid, encontrado integer, recolhido integer, baixado integer, reposto integer)
      on x.produto_id = p.id
    order by p.ordem
  loop
    v_saldo_ant := app.saldo_loja(p_loja_id, v_item.produto_id);

    if not v_item.informado then
      if v_saldo_ant > 0 then
        raise exception 'Faltou contar %: a loja tinha % pacotes.', v_item.nome_curto, v_saldo_ant;
      end if;
      continue;
    end if;

    if v_item.encontrado < 0 or v_item.recolhido < 0 or v_item.baixado < 0 or v_item.reposto < 0 then
      raise exception '%: quantidade negativa não é aceita.', v_item.nome_curto;
    end if;
    if v_item.reposto > 0 and not v_item.ativo then
      raise exception '% está fora de linha e não pode ser reposto.', v_item.nome_curto;
    end if;

    if v_direta then
      if v_saldo_ant <> 0 or v_item.encontrado <> 0 or v_item.recolhido <> 0 or v_item.baixado <> 0 then
        raise exception '%: loja de compra direta não tem contagem nem recolhimento, só a quantidade entregue.', v_item.nome_curto;
      end if;
      v_vendido := v_item.reposto;
      v_final := 0;
    else
      if v_item.encontrado > v_saldo_ant then
        raise exception '%: foram encontrados % pacotes, mas a loja tinha só %. Confira a contagem ou fale com a gestão.',
          v_item.nome_curto, v_item.encontrado, v_saldo_ant;
      end if;
      if v_item.recolhido + v_item.baixado > v_item.encontrado then
        raise exception '%: recolhido e baixado somam mais do que o encontrado.', v_item.nome_curto;
      end if;
      v_vendido := v_saldo_ant - v_item.encontrado;
      v_final := v_item.encontrado - v_item.recolhido - v_item.baixado + v_item.reposto;
    end if;

    if v_saldo_ant = 0 and v_vendido = 0 and v_final = 0 then
      continue;
    end if;

    v_saldo_rep := app.saldo_representante(v_loja.representante_id, v_item.produto_id);
    if v_saldo_rep + v_item.recolhido - v_item.reposto < 0 then
      raise exception '%: o representante tem % pacotes e a reposição é de %. Registre a retirada na fábrica antes.',
        v_item.nome_curto, v_saldo_rep + v_item.recolhido, v_item.reposto;
    end if;

    insert into public.visita_itens (visita_id, produto_id, saldo_anterior, encontrado, recolhido, baixado, reposto, vendido, saldo_final)
    values (p_id, v_item.produto_id, v_saldo_ant, v_item.encontrado, v_item.recolhido, v_item.baixado, v_item.reposto, v_vendido, v_final);

    if v_direta then
      perform app.movimenta(p_id, 'venda_direta', v_item.produto_id, v_item.reposto, 'representante', 'vendido',
        v_loja.representante_id, p_loja_id, p_id, null, null, v_quando, v_uid);
    else
      perform app.movimenta(p_id, 'venda', v_item.produto_id, v_vendido, 'loja', 'vendido',
        v_loja.representante_id, p_loja_id, p_id, null, null, v_quando, v_uid);
      perform app.movimenta(p_id, 'recolhimento', v_item.produto_id, v_item.recolhido, 'loja', 'representante',
        v_loja.representante_id, p_loja_id, p_id, null, null, v_quando, v_uid);
      perform app.movimenta(p_id, 'baixa', v_item.produto_id, v_item.baixado, 'loja', 'baixa',
        v_loja.representante_id, p_loja_id, p_id, null, 'Vencido ou danificado na loja', v_quando, v_uid);
      perform app.movimenta(p_id, 'reposicao', v_item.produto_id, v_item.reposto, 'representante', 'loja',
        v_loja.representante_id, p_loja_id, p_id, null, null, v_quando, v_uid);
    end if;

    if v_vendido > 0 then
      v_preco := public.preco_vigente(v_item.produto_id, v_loja.modalidade, (v_quando at time zone 'America/Sao_Paulo')::date);
      if v_preco is null then
        raise exception '% não tem preço cadastrado para esta modalidade. Peça à gestão para cadastrar.', v_item.nome_curto;
      end if;
      v_cobranca := v_cobranca || jsonb_build_object(
        'produto_id', v_item.produto_id, 'quantidade', v_vendido, 'preco_unitario', v_preco);
      v_total := v_total + v_vendido * v_preco;
    end if;
  end loop;

  if v_total > 0 then
    insert into public.acertos (visita_id, loja_id, representante_id, modalidade, valor_total)
    values (p_id, p_loja_id, v_loja.representante_id, v_loja.modalidade, v_total)
    returning id into v_acerto;

    insert into public.acerto_itens (acerto_id, produto_id, quantidade, preco_unitario, subtotal)
    select v_acerto, x.produto_id, x.quantidade, x.preco_unitario, x.quantidade * x.preco_unitario
    from jsonb_to_recordset(v_cobranca) as x(produto_id uuid, quantidade integer, preco_unitario numeric(10, 2));
  end if;

  return jsonb_build_object('visita_id', p_id, 'acerto_id', v_acerto, 'valor_total', v_total, 'repetida', false);
end;
$$;

create or replace function public.definir_foto_representante(p_representante_id uuid, p_path text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not (app.eh_gestao() or coalesce(p_representante_id = app.meu_representante_id(), false)) then
    raise exception 'Você só pode trocar a sua própria foto.';
  end if;
  if p_path is null or p_path not like 'representantes/' || p_representante_id || '/%' then
    raise exception 'Arquivo de foto inválido.';
  end if;
  update public.representantes set foto_path = p_path where id = p_representante_id;
end;
$$;
