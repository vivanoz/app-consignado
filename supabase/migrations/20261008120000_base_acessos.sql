-- Viva Noz Consignado · 01 · Base de acessos
-- Perfis de usuário, papéis e auditoria. Tudo o que vem depois se apoia nas
-- funções do schema "app" para decidir quem vê e faz o quê.

create schema if not exists app;
grant usage on schema app to authenticated;

create type public.papel_usuario as enum ('gestao', 'producao', 'representante');

-- Um perfil por usuário do Supabase Auth. Nasce inativo: alguém da gestão
-- precisa ativar e definir o papel antes de a pessoa enxergar qualquer dado.
create table public.perfis (
  id            uuid primary key references auth.users (id) on delete restrict,
  nome          text not null,
  email         text,
  telefone      text,
  papel         public.papel_usuario not null default 'representante',
  ativo         boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Data de hoje no fuso da operação (Maringá), não em UTC.
create function app.hoje() returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Papel do usuário logado. Nulo quando não há login ou o perfil está inativo.
create function app.papel() returns public.papel_usuario
language sql stable security definer
set search_path = ''
as $$
  select p.papel from public.perfis p
  where p.id = (select auth.uid()) and p.ativo
$$;

create function app.ativo() returns boolean
language sql stable
set search_path = ''
as $$ select app.papel() is not null $$;

create function app.eh_gestao() returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(app.papel() = 'gestao', false) $$;

create function app.eh_producao() returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(app.papel() = 'producao', false) $$;

-- Cria o perfil quando um usuário é criado no Auth.
create function app.novo_usuario() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function app.novo_usuario();

create function app.marca_atualizacao() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger perfis_atualizacao
  before update on public.perfis
  for each row execute function app.marca_atualizacao();

-- Histórico de alterações em cadastros: quem mudou, quando, antes e depois.
create table public.auditoria (
  id          bigint generated always as identity primary key,
  tabela      text not null,
  registro_id text not null,
  operacao    text not null,
  antes       jsonb,
  depois      jsonb,
  autor       uuid,
  ocorrido_em timestamptz not null default now()
);

create index auditoria_registro on public.auditoria (tabela, registro_id);

create function app.auditar() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.auditoria (tabela, registro_id, operacao, antes, depois, autor)
  values (
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    (select auth.uid())
  );
  return coalesce(new, old);
end;
$$;

-- Lançamentos não se editam nem se apagam: correção é um novo lançamento.
create function app.imutavel() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Registros de % não podem ser alterados nem apagados. Faça um lançamento de correção.', tg_table_name
    using errcode = 'P0001';
end;
$$;

create trigger perfis_auditoria
  after insert or update or delete on public.perfis
  for each row execute function app.auditar();

alter table public.perfis enable row level security;
alter table public.auditoria enable row level security;

create policy perfis_ver on public.perfis for select to authenticated
  using (id = (select auth.uid()) or (select app.eh_gestao()));

create policy perfis_gestao_altera on public.perfis for update to authenticated
  using ((select app.eh_gestao()))
  with check ((select app.eh_gestao()));

create policy auditoria_gestao on public.auditoria for select to authenticated
  using ((select app.eh_gestao()));

revoke all on public.perfis, public.auditoria from anon, authenticated;
grant select, update on public.perfis to authenticated;
grant select on public.auditoria to authenticated;
