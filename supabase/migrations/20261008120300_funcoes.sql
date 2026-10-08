-- Viva Noz Consignado · 04 · Funções de lançamento
-- Toda escrita de estoque, visita, acerto e pagamento passa por aqui.
-- Cada função confere quem está chamando, valida os números e grava tudo em
-- uma transação: ou entra inteiro, ou não entra nada.
-- O primeiro parâmetro (id da operação) vem do app e serve de chave de
-- repetição: reenviar o mesmo lançamento por internet ruim não duplica nada.

create function app.movimenta(
  p_operacao_id uuid, p_tipo public.mov_tipo, p_produto_id uuid, p_quantidade integer,
  p_origem public.local_tipo, p_destino public.local_tipo,
  p_representante_id uuid, p_loja_id uuid, p_visita_id uuid, p_lote_id uuid,
  p_motivo text, p_ocorrido_em timestamptz, p_autor uuid
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_quantidade = 0 then return; end if;
  insert into public.movimentacoes (
    operacao_id, tipo, produto_id, quantidade, origem, destino,
    representante_id, loja_id, visita_id, lote_id, motivo, ocorrido_em, registrado_por
  ) values (
    p_operacao_id, p_tipo, p_produto_id, p_quantidade, p_origem, p_destino,
    p_representante_id, p_loja_id, p_visita_id, p_lote_id, p_motivo, p_ocorrido_em, p_autor
  );
end;
$$;

-- Lê e valida uma lista [{produto_id, quantidade}] vinda do app.
create function app.itens_quantidade(p_itens jsonb)
returns table (produto_id uuid, nome_curto text, quantidade integer)
language plpgsql stable
set search_path = ''
as $$
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Lista de produtos inválida.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_itens) as x(produto_id uuid, quantidade integer)
    left join public.produtos p on p.id = x.produto_id
    where p.id is null or x.quantidade is null or x.quantidade < 0
  ) then
    raise exception 'Há produto desconhecido ou quantidade inválida na lista.';
  end if;
  if (select count(*) <> count(distinct x.produto_id)
      from jsonb_to_recordset(p_itens) as x(produto_id uuid)) then
    raise exception 'O mesmo produto aparece mais de uma vez na lista.';
  end if;
  return query
    select p.id, p.nome_curto, x.quantidade
    from jsonb_to_recordset(p_itens) as x(produto_id uuid, quantidade integer)
    join public.produtos p on p.id = x.produto_id
    where x.quantidade > 0
    order by p.ordem;
end;
$$;

-- Produção registra um lote: o produto entra no estoque da fábrica.
create function public.registrar_producao(
  p_operacao_id uuid, p_produto_id uuid, p_quantidade integer,
  p_produzido_em date default null, p_validade date default null, p_observacoes text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
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
  if not exists (select 1 from public.produtos where id = p_produto_id and ativo) then
    raise exception 'Produto não encontrado.';
  end if;

  insert into public.lotes_producao (produto_id, quantidade, produzido_em, validade, observacoes, registrado_por)
  values (p_produto_id, p_quantidade, coalesce(p_produzido_em, app.hoje()), p_validade, p_observacoes, v_uid)
  returning id into v_lote;

  perform app.movimenta(p_operacao_id, 'producao', p_produto_id, p_quantidade, 'producao', 'fabrica',
    null, null, null, v_lote, p_observacoes, now(), v_uid);

  return jsonb_build_object('operacao_id', p_operacao_id, 'lote_id', v_lote, 'repetida', false);
end;
$$;

-- Retirada: a fábrica entrega produto ao representante.
-- O estoque da fábrica ainda não é travado (controle de produção é da fase 2).
create function public.registrar_retirada(
  p_operacao_id uuid, p_representante_id uuid, p_itens jsonb, p_observacao text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item record;
  v_total integer := 0;
begin
  if coalesce(app.papel() in ('gestao', 'producao'), false) is not true then
    raise exception 'Só a gestão ou a produção registram retiradas.';
  end if;
  if p_operacao_id is null then raise exception 'Operação sem identificador.'; end if;
  if exists (select 1 from public.movimentacoes where operacao_id = p_operacao_id) then
    return jsonb_build_object('operacao_id', p_operacao_id, 'repetida', true);
  end if;
  if not exists (select 1 from public.representantes where id = p_representante_id and ativo) then
    raise exception 'Representante não encontrado ou inativo.';
  end if;

  for v_item in select * from app.itens_quantidade(p_itens) loop
    perform app.movimenta(p_operacao_id, 'retirada', v_item.produto_id, v_item.quantidade, 'fabrica', 'representante',
      p_representante_id, null, null, null, p_observacao, now(), v_uid);
    v_total := v_total + v_item.quantidade;
  end loop;

  if v_total = 0 then raise exception 'Informe ao menos um produto com quantidade.'; end if;
  return jsonb_build_object('operacao_id', p_operacao_id, 'pacotes', v_total, 'repetida', false);
end;
$$;

-- Devolução: o representante devolve produto à fábrica.
create function public.registrar_devolucao(
  p_operacao_id uuid, p_representante_id uuid, p_itens jsonb, p_observacao text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item record;
  v_saldo integer;
  v_total integer := 0;
begin
  if coalesce(app.papel() in ('gestao', 'producao'), false) is not true then
    raise exception 'Só a gestão ou a produção registram devoluções.';
  end if;
  if p_operacao_id is null then raise exception 'Operação sem identificador.'; end if;
  if exists (select 1 from public.movimentacoes where operacao_id = p_operacao_id) then
    return jsonb_build_object('operacao_id', p_operacao_id, 'repetida', true);
  end if;
  perform 1 from public.representantes where id = p_representante_id for update;
  if not found then raise exception 'Representante não encontrado.'; end if;

  for v_item in select * from app.itens_quantidade(p_itens) loop
    v_saldo := app.saldo_representante(p_representante_id, v_item.produto_id);
    if v_item.quantidade > v_saldo then
      raise exception '%: o representante tem % e a devolução é de %.', v_item.nome_curto, v_saldo, v_item.quantidade;
    end if;
    perform app.movimenta(p_operacao_id, 'devolucao', v_item.produto_id, v_item.quantidade, 'representante', 'fabrica',
      p_representante_id, null, null, null, p_observacao, now(), v_uid);
    v_total := v_total + v_item.quantidade;
  end loop;

  if v_total = 0 then raise exception 'Informe ao menos um produto com quantidade.'; end if;
  return jsonb_build_object('operacao_id', p_operacao_id, 'pacotes', v_total, 'repetida', false);
end;
$$;

-- Ajuste de contagem do estoque do representante (contagem física x app).
-- p_diferenca positivo: sobrou produto; negativo: faltou. Motivo obrigatório.
create function public.registrar_ajuste_representante(
  p_operacao_id uuid, p_representante_id uuid, p_produto_id uuid, p_diferenca integer, p_motivo text
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_saldo integer;
begin
  if not app.eh_gestao() then raise exception 'Só a gestão registra ajustes de estoque.'; end if;
  if p_operacao_id is null then raise exception 'Operação sem identificador.'; end if;
  if exists (select 1 from public.movimentacoes where operacao_id = p_operacao_id) then
    return jsonb_build_object('operacao_id', p_operacao_id, 'repetida', true);
  end if;
  if coalesce(p_diferenca, 0) = 0 then raise exception 'Informe a diferença encontrada.'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Explique o motivo do ajuste.'; end if;
  perform 1 from public.representantes where id = p_representante_id for update;
  if not found then raise exception 'Representante não encontrado.'; end if;
  if not exists (select 1 from public.produtos where id = p_produto_id) then
    raise exception 'Produto não encontrado.';
  end if;

  if p_diferenca > 0 then
    perform app.movimenta(p_operacao_id, 'ajuste', p_produto_id, p_diferenca, 'ajuste', 'representante',
      p_representante_id, null, null, null, p_motivo, now(), v_uid);
  else
    v_saldo := app.saldo_representante(p_representante_id, p_produto_id);
    if -p_diferenca > v_saldo then
      raise exception 'O representante tem % no app; não dá para ajustar % para menos.', v_saldo, -p_diferenca;
    end if;
    perform app.movimenta(p_operacao_id, 'ajuste', p_produto_id, -p_diferenca, 'representante', 'ajuste',
      p_representante_id, null, null, null, p_motivo, now(), v_uid);
  end if;
  return jsonb_build_object('operacao_id', p_operacao_id, 'repetida', false);
end;
$$;

-- Visita a uma loja: contagem, recolhimento, baixa, reposição e acerto.
-- p_itens: [{produto_id, encontrado, recolhido, baixado, reposto}]
--   encontrado: o que havia na prateleira ao chegar (contagem física)
--   recolhido:  o que o representante levou de volta, em bom estado
--   baixado:    vencido ou danificado, retirado da loja (custo da Viva Noz)
--   reposto:    o que o representante deixou nesta visita
create function public.registrar_visita(
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
  if not (app.eh_gestao() or v_loja.representante_id = app.meu_representante_id()) then
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

-- Gestão confirma o Pix de um acerto. É o único caminho para um acerto virar
-- "confirmado", e é sobre acertos confirmados que a comissão será calculada.
create function public.confirmar_pagamento(
  p_acerto_id uuid, p_valor numeric, p_recebido_em date default null, p_observacao text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_acerto public.acertos;
  v_data date := coalesce(p_recebido_em, app.hoje());
begin
  if not app.eh_gestao() then raise exception 'Só a gestão confirma pagamentos.'; end if;
  select * into v_acerto from public.acertos where id = p_acerto_id for update;
  if not found then raise exception 'Acerto não encontrado.'; end if;
  if v_acerto.status = 'confirmado' then raise exception 'Este acerto já foi confirmado.'; end if;
  if v_acerto.status = 'cancelado' then raise exception 'Este acerto foi cancelado.'; end if;
  if p_valor is distinct from v_acerto.valor_total then
    raise exception 'O valor informado (R$ %) é diferente do valor do acerto (R$ %).', p_valor, v_acerto.valor_total;
  end if;
  if v_data > app.hoje() then raise exception 'A data do pagamento não pode estar no futuro.'; end if;

  insert into public.pagamentos (acerto_id, valor, recebido_em, observacao, confirmado_por)
  values (p_acerto_id, p_valor, v_data, nullif(trim(p_observacao), ''), v_uid);

  update public.acertos
  set status = 'confirmado', confirmado_em = now(), confirmado_por = v_uid
  where id = p_acerto_id;

  return jsonb_build_object('acerto_id', p_acerto_id, 'status', 'confirmado');
end;
$$;

-- Gestão desfaz uma visita lançada errada. Só a última visita da loja, e só
-- se o acerto ainda não foi pago. O histórico fica: entram lançamentos
-- inversos e a visita e o acerto ficam marcados.
create function public.estornar_visita(p_visita_id uuid, p_motivo text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_visita public.visitas;
  v_mov    record;
  v_falta  record;
begin
  if not app.eh_gestao() then raise exception 'Só a gestão estorna visitas.'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Explique o motivo do estorno.'; end if;

  select * into v_visita from public.visitas where id = p_visita_id;
  if not found then raise exception 'Visita não encontrada.'; end if;
  perform 1 from public.lojas where id = v_visita.loja_id for update;
  perform 1 from public.representantes where id = v_visita.representante_id for update;
  select * into v_visita from public.visitas where id = p_visita_id for update;

  if v_visita.estornada_em is not null then raise exception 'Esta visita já foi estornada.'; end if;
  if exists (
    select 1 from public.visitas
    where loja_id = v_visita.loja_id and estornada_em is null and realizada_em > v_visita.realizada_em
  ) then
    raise exception 'Só a última visita da loja pode ser estornada.';
  end if;
  if exists (select 1 from public.acertos where visita_id = p_visita_id and status = 'confirmado') then
    raise exception 'O acerto desta visita já foi pago e não pode ser estornado.';
  end if;

  for v_mov in select * from public.movimentacoes where visita_id = p_visita_id and tipo <> 'estorno' loop
    perform app.movimenta(gen_random_uuid(), 'estorno', v_mov.produto_id, v_mov.quantidade, v_mov.destino, v_mov.origem,
      v_mov.representante_id, v_mov.loja_id, p_visita_id, null, p_motivo, now(), v_uid);
  end loop;

  select p.nome_curto, app.saldo_representante(v_visita.representante_id, p.id) as saldo into v_falta
  from public.produtos p
  where app.saldo_representante(v_visita.representante_id, p.id) < 0
  limit 1;
  if found then
    raise exception 'O estorno deixaria o estoque de % do representante negativo (%). O produto recolhido nesta visita já foi usado em outra loja.',
      v_falta.nome_curto, v_falta.saldo;
  end if;

  update public.visitas
  set estornada_em = now(), estornada_por = v_uid, estorno_motivo = trim(p_motivo)
  where id = p_visita_id;

  update public.acertos
  set status = 'cancelado', cancelado_em = now(), cancelado_por = v_uid, cancelado_motivo = trim(p_motivo)
  where visita_id = p_visita_id and status = 'pendente';

  return jsonb_build_object('visita_id', p_visita_id, 'estornada', true);
end;
$$;

-- Sempre precisa existir ao menos uma pessoa ativa na gestão.
create function app.perfis_protege() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.papel = 'gestao' and old.ativo
     and not exists (select 1 from public.perfis where papel = 'gestao' and ativo) then
    raise exception 'Não é possível deixar o app sem ninguém na gestão.';
  end if;
  return null;
end;
$$;

create trigger perfis_protege after update on public.perfis
  for each row execute function app.perfis_protege();

-- Ninguém sem login executa nada.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema app to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema app revoke execute on functions from public, anon;
