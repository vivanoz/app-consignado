-- Viva Noz Consignado · 06 · Comissões, repasses, comprovantes e fotos
--
-- Quando a gestão confirma o Pix de uma loja, nasce a comissão do
-- representante, já com valor e vencimento. O vencimento é o 5º dia útil do
-- mês seguinte ao do recebimento: Pix em 30/09 vence no 5º dia útil de
-- outubro; Pix em 01/10 vence no 5º dia útil de novembro.
-- O pagamento ao representante é um repasse: agrupa várias comissões, soma o
-- valor e guarda o comprovante.

-- ───────────────────────── Dias úteis ─────────────────────────

-- Dia útil aqui é de segunda a sexta, fora os feriados desta tabela.
create table public.feriados (
  dia  date primary key,
  nome text not null
);

insert into public.feriados (dia, nome) values
  ('2026-01-01', 'Confraternização Universal'),
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-09-07', 'Independência'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-11-20', 'Consciência Negra'),
  ('2026-12-25', 'Natal'),
  ('2027-01-01', 'Confraternização Universal'),
  ('2027-03-26', 'Sexta-feira Santa'),
  ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'),
  ('2027-09-07', 'Independência'),
  ('2027-10-12', 'Nossa Senhora Aparecida'),
  ('2027-11-02', 'Finados'),
  ('2027-11-15', 'Proclamação da República'),
  ('2027-11-20', 'Consciência Negra'),
  ('2027-12-25', 'Natal');

create function app.dia_util(p_dia date) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select extract(isodow from p_dia) < 6
     and not exists (select 1 from public.feriados f where f.dia = p_dia)
$$;

create function public.quinto_dia_util(p_ano integer, p_mes integer) returns date
language sql stable
set search_path = ''
as $$
  select d::date
  from generate_series(make_date(p_ano, p_mes, 1)::timestamp,
                       make_date(p_ano, p_mes, 1) + interval '20 days', interval '1 day') as d
  where app.dia_util(d::date)
  order by d
  offset 4 limit 1
$$;

-- Vencimento da comissão: 5º dia útil do mês seguinte ao do recebimento.
create function public.vencimento_comissao(p_recebido_em date) returns date
language sql stable
set search_path = ''
as $$
  select public.quinto_dia_util(
    extract(year from date_trunc('month', p_recebido_em) + interval '1 month')::integer,
    extract(month from date_trunc('month', p_recebido_em) + interval '1 month')::integer
  )
$$;

-- ───────────────────────── Comissões e repasses ─────────────────────────

create type public.comissao_tipo as enum ('comissao', 'bonus_abertura');
create type public.comissao_status as enum ('pendente', 'paga');

-- Pagamento da Viva Noz ao representante. Um repasse quita várias comissões.
create table public.repasses (
  id               uuid primary key,
  representante_id uuid not null references public.representantes (id),
  valor_total      numeric(12, 2) not null check (valor_total > 0),
  pago_em          date not null,
  comprovante_path text,
  observacao       text,
  registrado_por   uuid not null references public.perfis (id),
  criado_em        timestamptz not null default now()
);

create index repasses_representante on public.repasses (representante_id, pago_em desc);

create table public.comissoes (
  id               uuid primary key default gen_random_uuid(),
  representante_id uuid not null references public.representantes (id),
  tipo             public.comissao_tipo not null,
  acerto_id        uuid not null references public.acertos (id),
  loja_id          uuid not null references public.lojas (id),
  -- Valor que a loja pagou e percentual aplicado (nulos no bônus de abertura).
  base             numeric(12, 2),
  percentual       numeric(5, 4),
  valor            numeric(12, 2) not null check (valor > 0),
  recebido_em      date not null,
  vencimento       date not null,
  status           public.comissao_status not null default 'pendente',
  repasse_id       uuid references public.repasses (id),
  criado_em        timestamptz not null default now(),
  unique (acerto_id, tipo),
  check ((status = 'paga') = (repasse_id is not null))
);

-- Uma loja rende um único bônus de abertura.
create unique index comissoes_bonus_por_loja on public.comissoes (loja_id) where tipo = 'bonus_abertura';
create index comissoes_representante on public.comissoes (representante_id, status, vencimento);

alter table public.acertos add column comprovante_path text;
alter table public.visitas add column foto_path text;
alter table public.lojas add column foto_path text;
alter table public.representantes add column foto_path text;

create trigger comissoes_sem_apagar before delete on public.comissoes
  for each row execute function app.imutavel();
create trigger repasses_sem_apagar before delete on public.repasses
  for each row execute function app.imutavel();
create trigger repasses_auditoria after insert or update on public.repasses
  for each row execute function app.auditar();

-- Última visita válida de cada loja, para saber quem está há mais tempo sem reposição.
create view public.lojas_ultima_visita with (security_invoker = true) as
  select v.loja_id, max(v.realizada_em) as ultima_visita, count(*)::integer as visitas
  from public.visitas v
  where v.estornada_em is null
  group by v.loja_id;

-- Gera a comissão (e o bônus de abertura, se for o caso) de um acerto pago.
create function app.gera_comissoes(p_acerto_id uuid, p_recebido_em date) returns void
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
  order by vigente_desde desc limit 1;
  if not found then return; end if;

  v_percentual := case when v_acerto.modalidade = 'compra_direta' then v_cond.comissao_direta else v_cond.comissao_consignado end;
  v_valor := round(v_acerto.valor_total * v_percentual, 2);
  if v_valor > 0 then
    insert into public.comissoes (representante_id, tipo, acerto_id, loja_id, base, percentual, valor, recebido_em, vencimento)
    values (v_acerto.representante_id, 'comissao', p_acerto_id, v_acerto.loja_id, v_acerto.valor_total, v_percentual, v_valor, p_recebido_em, v_vencimento);
  end if;

  -- Bônus de abertura: liberado quando a loja paga o segundo acerto.
  if v_cond.bonus_abertura > 0
     and (select count(*) from public.acertos where loja_id = v_acerto.loja_id and status = 'confirmado') = 2
     and not exists (select 1 from public.comissoes where loja_id = v_acerto.loja_id and tipo = 'bonus_abertura') then
    insert into public.comissoes (representante_id, tipo, acerto_id, loja_id, valor, recebido_em, vencimento)
    values (v_acerto.representante_id, 'bonus_abertura', p_acerto_id, v_acerto.loja_id, v_cond.bonus_abertura, p_recebido_em, v_vencimento);
  end if;
end;
$$;

-- Mesma função da migração 04, agora gerando a comissão do representante.
create or replace function public.confirmar_pagamento(
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

  perform app.gera_comissoes(p_acerto_id, v_data);

  return jsonb_build_object('acerto_id', p_acerto_id, 'status', 'confirmado');
end;
$$;

-- Gestão registra o pagamento ao representante: escolhe as comissões, o
-- sistema soma e marca todas como pagas.
create function public.registrar_repasse(
  p_id uuid, p_representante_id uuid, p_comissao_ids uuid[],
  p_pago_em date default null, p_comprovante_path text default null, p_observacao text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_data  date := coalesce(p_pago_em, app.hoje());
  v_total numeric(12, 2);
  v_qtd   integer;
begin
  if not app.eh_gestao() then raise exception 'Só a gestão registra pagamentos a representantes.'; end if;
  if p_id is null then raise exception 'Repasse sem identificador.'; end if;
  if exists (select 1 from public.repasses where id = p_id) then
    return (select jsonb_build_object('repasse_id', r.id, 'valor_total', r.valor_total, 'repetida', true)
            from public.repasses r where r.id = p_id);
  end if;
  if coalesce(array_length(p_comissao_ids, 1), 0) = 0 then raise exception 'Escolha ao menos uma comissão.'; end if;
  if v_data > app.hoje() then raise exception 'A data do pagamento não pode estar no futuro.'; end if;

  perform 1 from public.comissoes where id = any (p_comissao_ids) for update;

  select count(*), sum(valor) into v_qtd, v_total
  from public.comissoes
  where id = any (p_comissao_ids) and representante_id = p_representante_id and status = 'pendente';

  if v_qtd <> (select count(distinct x) from unnest(p_comissao_ids) as x) then
    raise exception 'Alguma comissão escolhida já foi paga ou é de outro representante. Atualize a tela e tente de novo.';
  end if;

  insert into public.repasses (id, representante_id, valor_total, pago_em, comprovante_path, observacao, registrado_por)
  values (p_id, p_representante_id, v_total, v_data, nullif(trim(p_comprovante_path), ''), nullif(trim(p_observacao), ''), v_uid);

  update public.comissoes set status = 'paga', repasse_id = p_id where id = any (p_comissao_ids);

  return jsonb_build_object('repasse_id', p_id, 'valor_total', v_total, 'repetida', false);
end;
$$;

-- ───────────────────────── Fotos e comprovantes ─────────────────────────

create function app.vejo_acerto(p_acerto_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.acertos a
    where a.id = p_acerto_id
      and (app.vejo_loja(a.loja_id) or a.representante_id = app.meu_representante_id())
  )
$$;

create function app.vejo_visita(p_visita_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.visitas v
    where v.id = p_visita_id
      and (app.vejo_loja(v.loja_id) or v.representante_id = app.meu_representante_id())
  )
$$;

create function app.meu_repasse(p_repasse_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.repasses r
    where r.id = p_repasse_id and r.representante_id = app.meu_representante_id()
  )
$$;

-- Comprovante do Pix da loja. O representante pode anexar o que o parceiro
-- mandou; quem confirma o recebimento continua sendo só a gestão.
create function public.anexar_comprovante_acerto(p_acerto_id uuid, p_path text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_acerto public.acertos;
begin
  if not app.vejo_acerto(p_acerto_id) then raise exception 'Acerto não encontrado.'; end if;
  select * into v_acerto from public.acertos where id = p_acerto_id for update;
  if v_acerto.status = 'cancelado' then raise exception 'Este acerto foi cancelado.'; end if;
  if v_acerto.status = 'confirmado' and not app.eh_gestao() then
    raise exception 'Este acerto já foi confirmado. Só a gestão troca o comprovante.';
  end if;
  if p_path is null or p_path not like 'acertos/' || p_acerto_id || '/%' then
    raise exception 'Arquivo de comprovante inválido.';
  end if;
  update public.acertos set comprovante_path = p_path where id = p_acerto_id;
end;
$$;

create function public.anexar_comprovante_repasse(p_repasse_id uuid, p_path text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not app.eh_gestao() then raise exception 'Só a gestão anexa comprovante de repasse.'; end if;
  if p_path is null or p_path not like 'repasses/' || p_repasse_id || '/%' then
    raise exception 'Arquivo de comprovante inválido.';
  end if;
  update public.repasses set comprovante_path = p_path where id = p_repasse_id;
  if not found then raise exception 'Repasse não encontrado.'; end if;
end;
$$;

create function public.anexar_foto_visita(p_visita_id uuid, p_path text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not app.vejo_visita(p_visita_id) then raise exception 'Visita não encontrada.'; end if;
  if p_path is null or p_path not like 'visitas/' || p_visita_id || '/%' then
    raise exception 'Arquivo de foto inválido.';
  end if;
  update public.visitas set foto_path = p_path where id = p_visita_id;
end;
$$;

create function public.definir_foto_representante(p_representante_id uuid, p_path text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not (app.eh_gestao() or p_representante_id = app.meu_representante_id()) then
    raise exception 'Você só pode trocar a sua própria foto.';
  end if;
  if p_path is null or p_path not like 'representantes/' || p_representante_id || '/%' then
    raise exception 'Arquivo de foto inválido.';
  end if;
  update public.representantes set foto_path = p_path where id = p_representante_id;
end;
$$;

-- Arquivos ficam em dois espaços privados do Storage:
--   fotos/representantes/<id>/…  fotos/lojas/<id>/…  fotos/visitas/<id>/…
--   comprovantes/acertos/<id>/…  comprovantes/repasses/<id>/…
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('fotos', 'fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('comprovantes', 'comprovantes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- A pasta do arquivo diz a que registro ele pertence; vale a mesma regra de
-- quem enxerga o registro.
create function app.acesso_arquivo(p_bucket text, p_nome text, p_escrita boolean) returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_pasta text := split_part(p_nome, '/', 1);
  v_id    uuid;
begin
  if not app.ativo() then return false; end if;
  begin
    v_id := split_part(p_nome, '/', 2)::uuid;
  exception when others then
    return false;
  end;

  if p_bucket = 'fotos' then
    return case v_pasta
      when 'representantes' then not p_escrita or app.eh_gestao() or v_id = app.meu_representante_id()
      when 'lojas' then app.vejo_loja(v_id)
      when 'visitas' then app.vejo_visita(v_id)
      else false
    end;
  elsif p_bucket = 'comprovantes' then
    return case v_pasta
      when 'acertos' then app.vejo_acerto(v_id)
      when 'repasses' then app.eh_gestao() or (not p_escrita and app.meu_repasse(v_id))
      else false
    end;
  end if;
  return false;
end;
$$;

create policy vivanoz_arquivos_ler on storage.objects for select to authenticated
  using (bucket_id in ('fotos', 'comprovantes') and app.acesso_arquivo(bucket_id, name, false));

-- Só envio de arquivo novo: nada de sobrescrever nem apagar.
create policy vivanoz_arquivos_enviar on storage.objects for insert to authenticated
  with check (bucket_id in ('fotos', 'comprovantes') and app.acesso_arquivo(bucket_id, name, true));

-- ───────────────────────── Permissões ─────────────────────────

alter table public.feriados enable row level security;
alter table public.comissoes enable row level security;
alter table public.repasses enable row level security;

create policy feriados_ver on public.feriados for select to authenticated
  using ((select app.ativo()));
create policy feriados_gestao_insere on public.feriados for insert to authenticated
  with check ((select app.eh_gestao()));

-- Cada representante vê só as próprias comissões e repasses.
create policy comissoes_ver on public.comissoes for select to authenticated
  using ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()));
create policy repasses_ver on public.repasses for select to authenticated
  using ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()));

revoke all on public.feriados, public.comissoes, public.repasses, public.lojas_ultima_visita from anon, authenticated;
grant select, insert on public.feriados to authenticated;
grant select on public.comissoes, public.repasses, public.lojas_ultima_visita to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema app to authenticated;
