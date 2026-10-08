-- Viva Noz Consignado · 02 · Cadastros
-- Produtos, preços com vigência, custos (só gestão), representantes e lojas.

create type public.modalidade as enum ('kit_teste', 'consignado', 'compra_direta');
create type public.loja_status as enum ('ativa', 'pausada', 'encerrada');

create table public.produtos (
  id         uuid primary key default gen_random_uuid(),
  sku        text not null unique,
  nome       text not null,
  nome_curto text not null,
  peso_g     integer not null default 100 check (peso_g > 0),
  ordem      integer not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- Preço que a loja paga, por produto e modalidade, com data de início.
-- Vale o registro mais recente com vigente_desde <= data do acerto.
-- Kit Teste usa o preço do consignado.
create table public.precos (
  id             uuid primary key default gen_random_uuid(),
  produto_id     uuid not null references public.produtos (id),
  modalidade     public.modalidade not null check (modalidade <> 'kit_teste'),
  preco_loja     numeric(10, 2) not null check (preco_loja > 0),
  preco_sugerido numeric(10, 2) check (preco_sugerido > 0),
  vigente_desde  date not null default app.hoje(),
  criado_por     uuid references public.perfis (id) default auth.uid(),
  criado_em      timestamptz not null default now(),
  unique (produto_id, modalidade, vigente_desde)
);

-- Custo direto por pacote. Só a gestão enxerga.
create table public.produto_custos (
  id            uuid primary key default gen_random_uuid(),
  produto_id    uuid not null references public.produtos (id),
  custo_direto  numeric(10, 2) not null check (custo_direto >= 0),
  vigente_desde date not null default app.hoje(),
  criado_por    uuid references public.perfis (id) default auth.uid(),
  criado_em     timestamptz not null default now(),
  unique (produto_id, vigente_desde)
);

create table public.representantes (
  id            uuid primary key default gen_random_uuid(),
  perfil_id     uuid unique references public.perfis (id),
  nome          text not null,
  telefone      text,
  territorio    text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Condições comerciais do representante, com vigência.
create table public.representante_condicoes (
  id                  uuid primary key default gen_random_uuid(),
  representante_id    uuid not null references public.representantes (id),
  comissao_consignado numeric(5, 4) not null default 0.15 check (comissao_consignado between 0 and 1),
  comissao_direta     numeric(5, 4) not null default 0.12 check (comissao_direta between 0 and 1),
  bonus_abertura      numeric(10, 2) not null default 30 check (bonus_abertura >= 0),
  vigente_desde       date not null default app.hoje(),
  criado_por          uuid references public.perfis (id) default auth.uid(),
  criado_em           timestamptz not null default now(),
  unique (representante_id, vigente_desde)
);

create table public.lojas (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  segmento         text,
  endereco         text,
  bairro           text,
  cidade           text not null default 'Maringá',
  contato_nome     text,
  contato_telefone text,
  representante_id uuid not null references public.representantes (id),
  modalidade       public.modalidade not null default 'kit_teste',
  status           public.loja_status not null default 'ativa',
  data_abertura    date not null default app.hoje(),
  observacoes      text,
  criado_por       uuid references public.perfis (id) default auth.uid(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create index lojas_representante on public.lojas (representante_id);

-- Representante vinculado ao usuário logado (nulo se não houver).
-- Quem é da gestão também pode ter um cadastro de representante, como a
-- fundadora, que hoje faz as visitas.
create function app.meu_representante_id() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select r.id
  from public.representantes r
  join public.perfis p on p.id = r.perfil_id
  where r.perfil_id = (select auth.uid()) and r.ativo and p.ativo
$$;

-- O usuário logado enxerga esta loja? Gestão vê todas; representante, as suas.
create function app.vejo_loja(p_loja_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.eh_gestao() or exists (
    select 1 from public.lojas l
    where l.id = p_loja_id and l.representante_id = app.meu_representante_id()
  )
$$;

create function public.preco_vigente(p_produto_id uuid, p_modalidade public.modalidade, p_data date)
returns numeric
language sql stable
set search_path = ''
as $$
  select pr.preco_loja
  from public.precos pr
  where pr.produto_id = p_produto_id
    and pr.modalidade = case when p_modalidade = 'kit_teste' then 'consignado'::public.modalidade else p_modalidade end
    and pr.vigente_desde <= p_data
  order by pr.vigente_desde desc
  limit 1
$$;

-- Só a gestão troca representante, modalidade ou status de uma loja.
create function app.lojas_protege() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not app.eh_gestao() and (
       new.representante_id is distinct from old.representante_id
    or new.modalidade is distinct from old.modalidade
    or new.status is distinct from old.status
  ) then
    raise exception 'Só a gestão pode mudar representante, modalidade ou status da loja.';
  end if;
  return new;
end;
$$;

create trigger lojas_protege before update on public.lojas
  for each row execute function app.lojas_protege();
create trigger lojas_atualizacao before update on public.lojas
  for each row execute function app.marca_atualizacao();
create trigger representantes_atualizacao before update on public.representantes
  for each row execute function app.marca_atualizacao();

create trigger lojas_auditoria after insert or update or delete on public.lojas
  for each row execute function app.auditar();
create trigger representantes_auditoria after insert or update or delete on public.representantes
  for each row execute function app.auditar();
create trigger produtos_auditoria after insert or update or delete on public.produtos
  for each row execute function app.auditar();
create trigger precos_auditoria after insert or update or delete on public.precos
  for each row execute function app.auditar();
create trigger condicoes_auditoria after insert or update or delete on public.representante_condicoes
  for each row execute function app.auditar();

-- Preço e condição lançados não mudam: um novo valor é uma nova vigência.
create trigger precos_imutavel before update or delete on public.precos
  for each row execute function app.imutavel();
create trigger custos_imutavel before update or delete on public.produto_custos
  for each row execute function app.imutavel();
create trigger condicoes_imutavel before update or delete on public.representante_condicoes
  for each row execute function app.imutavel();

alter table public.produtos enable row level security;
alter table public.precos enable row level security;
alter table public.produto_custos enable row level security;
alter table public.representantes enable row level security;
alter table public.representante_condicoes enable row level security;
alter table public.lojas enable row level security;

-- Produtos: todo usuário ativo lê; gestão cadastra e altera.
create policy produtos_ver on public.produtos for select to authenticated
  using ((select app.ativo()));
create policy produtos_gestao_insere on public.produtos for insert to authenticated
  with check ((select app.eh_gestao()));
create policy produtos_gestao_altera on public.produtos for update to authenticated
  using ((select app.eh_gestao())) with check ((select app.eh_gestao()));

-- Preços de loja: gestão e representante leem; produção não precisa.
create policy precos_ver on public.precos for select to authenticated
  using ((select app.papel()) in ('gestao', 'representante'));
create policy precos_gestao_insere on public.precos for insert to authenticated
  with check ((select app.eh_gestao()));

-- Custos: só gestão.
create policy custos_gestao_ver on public.produto_custos for select to authenticated
  using ((select app.eh_gestao()));
create policy custos_gestao_insere on public.produto_custos for insert to authenticated
  with check ((select app.eh_gestao()));

-- Representantes: gestão e produção veem todos (a produção entrega produto a
-- eles); o representante vê só o próprio cadastro.
create policy representantes_ver on public.representantes for select to authenticated
  using (
    (select app.papel()) in ('gestao', 'producao')
    or id = (select app.meu_representante_id())
  );
create policy representantes_gestao_insere on public.representantes for insert to authenticated
  with check ((select app.eh_gestao()));
create policy representantes_gestao_altera on public.representantes for update to authenticated
  using ((select app.eh_gestao())) with check ((select app.eh_gestao()));

-- Condições comerciais: gestão vê todas; o representante, as suas.
create policy condicoes_ver on public.representante_condicoes for select to authenticated
  using (
    (select app.eh_gestao())
    or representante_id = (select app.meu_representante_id())
  );
create policy condicoes_gestao_insere on public.representante_condicoes for insert to authenticated
  with check ((select app.eh_gestao()));

-- Lojas: gestão vê e altera todas; o representante abre e cuida das suas.
create policy lojas_ver on public.lojas for select to authenticated
  using (
    (select app.eh_gestao())
    or representante_id = (select app.meu_representante_id())
  );
create policy lojas_insere on public.lojas for insert to authenticated
  with check (
    (select app.eh_gestao())
    or (representante_id = (select app.meu_representante_id()) and status = 'ativa')
  );
create policy lojas_altera on public.lojas for update to authenticated
  using (
    (select app.eh_gestao())
    or representante_id = (select app.meu_representante_id())
  )
  with check (
    (select app.eh_gestao())
    or representante_id = (select app.meu_representante_id())
  );

revoke all on public.produtos, public.precos, public.produto_custos, public.representantes,
  public.representante_condicoes, public.lojas from anon, authenticated;
grant select, insert, update on public.produtos, public.representantes, public.lojas to authenticated;
grant select, insert on public.precos, public.produto_custos, public.representante_condicoes to authenticated;

-- Os três produtos da linha.
insert into public.produtos (sku, nome, nome_curto, ordem) values
  ('MIX-100',  'Mix de Castanhas',                'Mix',          1),
  ('CAR-100',  'Caju Caramelizada com Gergelim',  'Caramelizada', 2),
  ('CAJU-100', 'Castanha de Caju com Sal W1',     'Caju com Sal', 3);
