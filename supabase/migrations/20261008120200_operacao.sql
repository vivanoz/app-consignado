-- Viva Noz Consignado · 03 · Operação
-- Razão de movimentações de estoque, visitas, acertos e pagamentos.
-- O saldo de cada lugar é sempre a soma das movimentações, nunca um número
-- digitado. Nada aqui é gravado direto pelo app: tudo passa pelas funções da
-- migração 04, que validam e gravam em uma única transação.

-- Onde um pacote pode estar. "producao" e "ajuste" são origens/destinos
-- contábeis (de onde o pacote nasce e para onde vão diferenças de contagem).
create type public.local_tipo as enum (
  'producao', 'fabrica', 'representante', 'loja', 'vendido', 'baixa', 'ajuste'
);

create type public.mov_tipo as enum (
  'producao',      -- producao -> fabrica
  'retirada',      -- fabrica -> representante
  'devolucao',     -- representante -> fabrica
  'reposicao',     -- representante -> loja
  'recolhimento',  -- loja -> representante
  'venda',         -- loja -> vendido
  'venda_direta',  -- representante -> vendido
  'baixa',         -- loja ou representante -> baixa (vencido, danificado)
  'ajuste',        -- diferença de contagem
  'estorno'        -- desfaz um lançamento anterior
);

create type public.acerto_status as enum ('pendente', 'confirmado', 'cancelado');

create table public.lotes_producao (
  id             uuid primary key default gen_random_uuid(),
  produto_id     uuid not null references public.produtos (id),
  quantidade     integer not null check (quantidade > 0),
  produzido_em   date not null default app.hoje(),
  validade       date,
  observacoes    text,
  registrado_por uuid not null references public.perfis (id),
  criado_em      timestamptz not null default now()
);

create table public.visitas (
  id               uuid primary key,
  loja_id          uuid not null references public.lojas (id),
  representante_id uuid not null references public.representantes (id),
  modalidade       public.modalidade not null,
  realizada_em     timestamptz not null default now(),
  observacoes      text,
  registrado_por   uuid not null references public.perfis (id),
  criado_em        timestamptz not null default now(),
  estornada_em     timestamptz,
  estornada_por    uuid references public.perfis (id),
  estorno_motivo   text
);

create index visitas_loja on public.visitas (loja_id, realizada_em desc);

-- Contagem por produto em uma visita.
--   vendido     = saldo_anterior - encontrado
--   saldo_final = encontrado - recolhido - baixado + reposto
-- Na compra direta não fica saldo na loja: vendido = reposto.
create table public.visita_itens (
  visita_id      uuid not null references public.visitas (id),
  produto_id     uuid not null references public.produtos (id),
  saldo_anterior integer not null check (saldo_anterior >= 0),
  encontrado     integer not null check (encontrado >= 0),
  recolhido      integer not null default 0 check (recolhido >= 0),
  baixado        integer not null default 0 check (baixado >= 0),
  reposto        integer not null default 0 check (reposto >= 0),
  vendido        integer not null check (vendido >= 0),
  saldo_final    integer not null check (saldo_final >= 0),
  primary key (visita_id, produto_id),
  check (encontrado <= saldo_anterior),
  check (recolhido + baixado <= encontrado)
);

create table public.movimentacoes (
  id               uuid primary key default gen_random_uuid(),
  operacao_id      uuid not null,
  tipo             public.mov_tipo not null,
  produto_id       uuid not null references public.produtos (id),
  quantidade       integer not null check (quantidade > 0),
  origem           public.local_tipo not null,
  destino          public.local_tipo not null,
  representante_id uuid references public.representantes (id),
  loja_id          uuid references public.lojas (id),
  visita_id        uuid references public.visitas (id),
  lote_id          uuid references public.lotes_producao (id),
  motivo           text,
  ocorrido_em      timestamptz not null default now(),
  registrado_por   uuid not null references public.perfis (id),
  criado_em        timestamptz not null default now(),
  check (origem <> destino),
  check (not (origem = 'representante' or destino = 'representante') or representante_id is not null),
  check (not (origem = 'loja' or destino = 'loja') or loja_id is not null)
);

create index movimentacoes_loja on public.movimentacoes (loja_id, produto_id) where loja_id is not null;
create index movimentacoes_representante on public.movimentacoes (representante_id, produto_id) where representante_id is not null;
create index movimentacoes_operacao on public.movimentacoes (operacao_id);
create index movimentacoes_visita on public.movimentacoes (visita_id) where visita_id is not null;

create table public.acertos (
  id               uuid primary key default gen_random_uuid(),
  visita_id        uuid not null unique references public.visitas (id),
  loja_id          uuid not null references public.lojas (id),
  representante_id uuid not null references public.representantes (id),
  modalidade       public.modalidade not null,
  valor_total      numeric(12, 2) not null check (valor_total > 0),
  status           public.acerto_status not null default 'pendente',
  criado_em        timestamptz not null default now(),
  confirmado_em    timestamptz,
  confirmado_por   uuid references public.perfis (id),
  cancelado_em     timestamptz,
  cancelado_por    uuid references public.perfis (id),
  cancelado_motivo text
);

create index acertos_loja on public.acertos (loja_id, criado_em desc);
create index acertos_status on public.acertos (status);

-- O preço fica gravado no acerto: mudar a tabela depois não muda o passado.
create table public.acerto_itens (
  acerto_id      uuid not null references public.acertos (id),
  produto_id     uuid not null references public.produtos (id),
  quantidade     integer not null check (quantidade > 0),
  preco_unitario numeric(10, 2) not null check (preco_unitario > 0),
  subtotal       numeric(12, 2) not null,
  primary key (acerto_id, produto_id),
  check (subtotal = quantidade * preco_unitario)
);

-- Pix recebido da loja. Só a gestão registra.
create table public.pagamentos (
  id             uuid primary key default gen_random_uuid(),
  acerto_id      uuid not null unique references public.acertos (id),
  valor          numeric(12, 2) not null check (valor > 0),
  recebido_em    date not null,
  observacao     text,
  confirmado_por uuid not null references public.perfis (id),
  criado_em      timestamptz not null default now()
);

create trigger movimentacoes_imutavel before update or delete on public.movimentacoes
  for each row execute function app.imutavel();
create trigger visita_itens_imutavel before update or delete on public.visita_itens
  for each row execute function app.imutavel();
create trigger acerto_itens_imutavel before update or delete on public.acerto_itens
  for each row execute function app.imutavel();
create trigger pagamentos_imutavel before update or delete on public.pagamentos
  for each row execute function app.imutavel();
create trigger lotes_imutavel before update or delete on public.lotes_producao
  for each row execute function app.imutavel();
create trigger visitas_sem_apagar before delete on public.visitas
  for each row execute function app.imutavel();
create trigger acertos_sem_apagar before delete on public.acertos
  for each row execute function app.imutavel();
create trigger acertos_auditoria after update on public.acertos
  for each row execute function app.auditar();

-- Saldos. As views respeitam as permissões de quem consulta.
create view public.saldos_loja with (security_invoker = true) as
  select m.loja_id, m.produto_id,
         sum(case when m.destino = 'loja' then m.quantidade else -m.quantidade end)::integer as saldo
  from public.movimentacoes m
  where m.loja_id is not null and (m.origem = 'loja' or m.destino = 'loja')
  group by m.loja_id, m.produto_id;

create view public.saldos_representante with (security_invoker = true) as
  select m.representante_id, m.produto_id,
         sum(case when m.destino = 'representante' then m.quantidade else -m.quantidade end)::integer as saldo
  from public.movimentacoes m
  where m.representante_id is not null and (m.origem = 'representante' or m.destino = 'representante')
  group by m.representante_id, m.produto_id;

create view public.saldos_fabrica with (security_invoker = true) as
  select m.produto_id,
         sum(case when m.destino = 'fabrica' then m.quantidade else -m.quantidade end)::integer as saldo
  from public.movimentacoes m
  where m.origem = 'fabrica' or m.destino = 'fabrica'
  group by m.produto_id;

-- Saldos para uso interno das funções (não dependem de quem está logado).
create function app.saldo_loja(p_loja_id uuid, p_produto_id uuid) returns integer
language sql stable security definer
set search_path = ''
as $$
  select coalesce(sum(case when m.destino = 'loja' then m.quantidade else -m.quantidade end), 0)::integer
  from public.movimentacoes m
  where m.loja_id = p_loja_id and m.produto_id = p_produto_id
    and (m.origem = 'loja' or m.destino = 'loja')
$$;

create function app.saldo_representante(p_representante_id uuid, p_produto_id uuid) returns integer
language sql stable security definer
set search_path = ''
as $$
  select coalesce(sum(case when m.destino = 'representante' then m.quantidade else -m.quantidade end), 0)::integer
  from public.movimentacoes m
  where m.representante_id = p_representante_id and m.produto_id = p_produto_id
    and (m.origem = 'representante' or m.destino = 'representante')
$$;

-- Loja com produto em consignação não vira compra direta nem troca de
-- representante sem antes zerar o saldo em uma visita.
create function app.lojas_saldo_protege() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if (new.modalidade = 'compra_direta' and old.modalidade <> 'compra_direta')
     or new.representante_id is distinct from old.representante_id then
    if exists (
      select 1 from public.produtos p where app.saldo_loja(new.id, p.id) <> 0
    ) then
      raise exception 'Esta loja ainda tem produto em consignação. Faça uma visita recolhendo tudo antes de mudar a modalidade para compra direta ou trocar o representante.';
    end if;
  end if;
  return new;
end;
$$;

create trigger lojas_saldo_protege before update on public.lojas
  for each row execute function app.lojas_saldo_protege();

alter table public.lotes_producao enable row level security;
alter table public.visitas enable row level security;
alter table public.visita_itens enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.acertos enable row level security;
alter table public.acerto_itens enable row level security;
alter table public.pagamentos enable row level security;

-- Só leitura para o app; a escrita é feita pelas funções.
create policy lotes_ver on public.lotes_producao for select to authenticated
  using ((select app.papel()) in ('gestao', 'producao'));

create policy visitas_ver on public.visitas for select to authenticated
  using ((select app.vejo_loja(loja_id)) or representante_id = (select app.meu_representante_id()));

create policy visita_itens_ver on public.visita_itens for select to authenticated
  using (exists (select 1 from public.visitas v where v.id = visita_id));

-- Gestão vê tudo; produção vê o que entra e sai da fábrica; representante vê
-- o que passou por ele e pelas lojas dele.
create policy movimentacoes_ver on public.movimentacoes for select to authenticated
  using (
    (select app.eh_gestao())
    or ((select app.eh_producao()) and (origem = 'fabrica' or destino = 'fabrica'))
    or representante_id = (select app.meu_representante_id())
    or (loja_id is not null and (select app.vejo_loja(loja_id)))
  );

create policy acertos_ver on public.acertos for select to authenticated
  using ((select app.vejo_loja(loja_id)) or representante_id = (select app.meu_representante_id()));

create policy acerto_itens_ver on public.acerto_itens for select to authenticated
  using (exists (select 1 from public.acertos a where a.id = acerto_id));

create policy pagamentos_ver on public.pagamentos for select to authenticated
  using (exists (select 1 from public.acertos a where a.id = acerto_id));

revoke all on public.lotes_producao, public.visitas, public.visita_itens, public.movimentacoes,
  public.acertos, public.acerto_itens, public.pagamentos,
  public.saldos_loja, public.saldos_representante, public.saldos_fabrica from anon, authenticated;
grant select on public.lotes_producao, public.visitas, public.visita_itens, public.movimentacoes,
  public.acertos, public.acerto_itens, public.pagamentos,
  public.saldos_loja, public.saldos_representante, public.saldos_fabrica to authenticated;
