-- Viva Noz Consignado · 18 · CRM: interações e atividades
--
-- Interação: o que já aconteceu com um lead ou cliente (visita, ligação,
-- mensagem, anotação). É histórico: não se edita.
-- Atividade: o que precisa ser feito e quando (lembrete). Pode ser de um
-- lead, de um cliente ou solta. Tem responsável e fica aberta até concluir.
-- Toda visita a uma loja cria sozinha a atividade de voltar para repor,
-- no prazo da loja (15 dias por padrão).

alter table public.prospectos add column origem text;

alter table public.lojas
  add column dias_reposicao integer not null default 15 check (dias_reposicao between 1 and 180);

create type public.interacao_tipo as enum ('visita', 'whatsapp', 'ligacao', 'email', 'nota');
create type public.atividade_tipo as enum ('lembrete', 'reposicao');

create table public.interacoes (
  id               uuid primary key default gen_random_uuid(),
  tipo             public.interacao_tipo not null,
  descricao        text not null check (length(trim(descricao)) > 0),
  ocorrido_em      timestamptz not null default now(),
  representante_id uuid not null references public.representantes (id),
  prospecto_id     uuid references public.prospectos (id),
  loja_id          uuid references public.lojas (id),
  registrado_por   uuid references public.perfis (id) default auth.uid(),
  criado_em        timestamptz not null default now(),
  check (num_nonnulls(prospecto_id, loja_id) = 1)
);

create index interacoes_prospecto on public.interacoes (prospecto_id, ocorrido_em desc) where prospecto_id is not null;
create index interacoes_loja on public.interacoes (loja_id, ocorrido_em desc) where loja_id is not null;

create table public.atividades (
  id               uuid primary key default gen_random_uuid(),
  tipo             public.atividade_tipo not null default 'lembrete',
  titulo           text not null check (length(trim(titulo)) > 0),
  descricao        text,
  vence_em         date not null,
  representante_id uuid not null references public.representantes (id),
  prospecto_id     uuid references public.prospectos (id),
  loja_id          uuid references public.lojas (id),
  concluida_em     timestamptz,
  concluida_por    uuid references public.perfis (id),
  criado_por       uuid references public.perfis (id) default auth.uid(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  check (num_nonnulls(prospecto_id, loja_id) <= 1)
);

create index atividades_abertas on public.atividades (representante_id, vence_em) where concluida_em is null;
create index atividades_loja on public.atividades (loja_id) where loja_id is not null;
create index atividades_prospecto on public.atividades (prospecto_id) where prospecto_id is not null;

create trigger interacoes_imutavel before update or delete on public.interacoes
  for each row execute function app.imutavel();
create trigger atividades_atualizacao before update on public.atividades
  for each row execute function app.marca_atualizacao();
create trigger atividades_sem_apagar before delete on public.atividades
  for each row execute function app.imutavel();

-- Depois de cada visita: fecha o lembrete de reposição que estava aberto para
-- a loja e abre o próximo, no prazo combinado com ela.
create function app.agenda_reposicao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_loja public.lojas;
begin
  update public.atividades
  set concluida_em = now(), concluida_por = new.registrado_por
  where loja_id = new.loja_id and tipo = 'reposicao' and concluida_em is null;

  select * into v_loja from public.lojas where id = new.loja_id;
  if v_loja.status = 'ativa' then
    insert into public.atividades (tipo, titulo, vence_em, representante_id, loja_id, criado_por)
    values ('reposicao', 'Voltar para repor',
            (new.realizada_em at time zone 'America/Sao_Paulo')::date + v_loja.dias_reposicao,
            new.representante_id, new.loja_id, new.registrado_por);
  end if;
  return new;
end;
$$;

create trigger visitas_agenda_reposicao after insert on public.visitas
  for each row execute function app.agenda_reposicao();

-- Amostra entregue leva o lead para a etapa "amostra" e fica no histórico.
-- Mesma função da migração 12, com essas duas mudanças.
create or replace function public.registrar_amostra(
  p_id uuid, p_prospecto_id uuid, p_itens jsonb,
  p_entregue_em date default null, p_observacoes text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_data      date := coalesce(p_entregue_em, app.hoje());
  v_prospecto public.prospectos;
  v_item      record;
  v_saldo     integer;
  v_total     integer := 0;
  v_resumo    text := '';
begin
  if not app.ativo() then raise exception 'Acesso não autorizado.'; end if;
  if p_id is null then raise exception 'Amostra sem identificador.'; end if;
  if exists (select 1 from public.amostras where id = p_id) then
    return jsonb_build_object('amostra_id', p_id, 'repetida', true);
  end if;

  select * into v_prospecto from public.prospectos where id = p_prospecto_id;
  if not found then raise exception 'Potencial cliente não encontrado.'; end if;
  if not (app.eh_gestao() or coalesce(v_prospecto.representante_id = app.meu_representante_id(), false)) then
    raise exception 'Este potencial cliente é de outro representante.';
  end if;
  if v_data > app.hoje() then raise exception 'A data da entrega não pode estar no futuro.'; end if;

  -- O estoque que sai é o de quem cuida do potencial cliente.
  perform 1 from public.representantes where id = v_prospecto.representante_id for update;

  insert into public.amostras (id, prospecto_id, representante_id, entregue_em, observacoes, registrado_por)
  values (p_id, p_prospecto_id, v_prospecto.representante_id, v_data, nullif(trim(p_observacoes), ''), v_uid);

  for v_item in select * from app.itens_quantidade(p_itens) loop
    v_saldo := app.saldo_representante(v_prospecto.representante_id, v_item.produto_id);
    if v_item.quantidade > v_saldo then
      raise exception '%: o estoque no app é de % e a amostra é de %. Registre a retirada na fábrica antes.',
        v_item.nome_curto, v_saldo, v_item.quantidade;
    end if;
    insert into public.amostra_itens (amostra_id, produto_id, quantidade)
    values (p_id, v_item.produto_id, v_item.quantidade);
    perform app.movimenta(p_id, 'amostra', v_item.produto_id, v_item.quantidade, 'representante', 'amostra',
      v_prospecto.representante_id, null, null, null, 'Amostra: ' || v_prospecto.nome, now(), v_uid);
    v_total := v_total + v_item.quantidade;
    v_resumo := v_resumo || case when v_resumo = '' then '' else ', ' end || v_item.nome_curto || ' ' || v_item.quantidade;
  end loop;

  if v_total = 0 then raise exception 'Informe ao menos um produto entregue.'; end if;

  update public.prospectos set status = 'amostra' where id = p_prospecto_id and status in ('novo', 'em_conversa');

  insert into public.interacoes (tipo, descricao, ocorrido_em, representante_id, prospecto_id, registrado_por)
  values ('visita', 'Amostra entregue: ' || v_resumo || coalesce('. ' || nullif(trim(p_observacoes), ''), ''),
          now(), v_prospecto.representante_id, p_prospecto_id, v_uid);

  return jsonb_build_object('amostra_id', p_id, 'pacotes', v_total, 'repetida', false);
end;
$$;

alter table public.interacoes enable row level security;
alter table public.atividades enable row level security;

-- Gestão vê e lança em tudo; o representante, no que é dele.
create policy interacoes_ver on public.interacoes for select to authenticated
  using ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()));
create policy interacoes_insere on public.interacoes for insert to authenticated
  with check ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()));

create policy atividades_ver on public.atividades for select to authenticated
  using ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()));
create policy atividades_insere on public.atividades for insert to authenticated
  with check ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()));
create policy atividades_altera on public.atividades for update to authenticated
  using ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()))
  with check ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()));

revoke all on public.interacoes, public.atividades from anon, authenticated;
grant select, insert on public.interacoes to authenticated;
grant select, insert, update on public.atividades to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema app to authenticated;
