-- Viva Noz Consignado · 12 · Potenciais clientes e amostras
--
-- Potencial cliente é um ponto de venda que ainda não é loja. Toda amostra é
-- entregue a um potencial cliente: sai do estoque de quem entregou e fica
-- registrada como amostra (custo da Viva Noz, sem acerto e sem comissão).
-- Quando o potencial fecha, vira loja e guarda a ligação com o cadastro novo.

create type public.prospecto_status as enum ('novo', 'em_conversa', 'virou_loja', 'descartado');

create table public.prospectos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  segmento         text,
  cep              text check (cep ~ '^\d{8}$'),
  endereco         text,
  numero           text,
  complemento      text,
  bairro           text,
  cidade           text not null default 'Maringá',
  uf               text not null default 'PR' check (uf ~ '^[A-Z]{2}$'),
  contato_nome     text,
  contato_telefone text,
  representante_id uuid not null references public.representantes (id),
  status           public.prospecto_status not null default 'novo',
  loja_id          uuid references public.lojas (id),
  observacoes      text,
  criado_por       uuid references public.perfis (id) default auth.uid(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create index prospectos_representante on public.prospectos (representante_id, status);

create table public.amostras (
  id               uuid primary key,
  prospecto_id     uuid not null references public.prospectos (id),
  representante_id uuid not null references public.representantes (id),
  entregue_em      date not null,
  observacoes      text,
  registrado_por   uuid not null references public.perfis (id),
  criado_em        timestamptz not null default now()
);

create index amostras_prospecto on public.amostras (prospecto_id, entregue_em desc);

create table public.amostra_itens (
  amostra_id uuid not null references public.amostras (id),
  produto_id uuid not null references public.produtos (id),
  quantidade integer not null check (quantidade > 0),
  primary key (amostra_id, produto_id)
);

create trigger prospectos_atualizacao before update on public.prospectos
  for each row execute function app.marca_atualizacao();
create trigger prospectos_auditoria after insert or update or delete on public.prospectos
  for each row execute function app.auditar();
create trigger amostras_imutavel before update or delete on public.amostras
  for each row execute function app.imutavel();
create trigger amostra_itens_imutavel before update or delete on public.amostra_itens
  for each row execute function app.imutavel();

-- p_itens: [{produto_id, quantidade}]
create function public.registrar_amostra(
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
  end loop;

  if v_total = 0 then raise exception 'Informe ao menos um produto entregue.'; end if;

  -- Quem recebeu amostra já está em conversa.
  update public.prospectos set status = 'em_conversa' where id = p_prospecto_id and status = 'novo';

  return jsonb_build_object('amostra_id', p_id, 'pacotes', v_total, 'repetida', false);
end;
$$;

alter table public.prospectos enable row level security;
alter table public.amostras enable row level security;
alter table public.amostra_itens enable row level security;

-- Gestão vê todos; o representante cadastra e cuida dos seus.
create policy prospectos_ver on public.prospectos for select to authenticated
  using ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()));
create policy prospectos_insere on public.prospectos for insert to authenticated
  with check ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()));
create policy prospectos_altera on public.prospectos for update to authenticated
  using ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()))
  with check ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()));

create policy amostras_ver on public.amostras for select to authenticated
  using ((select app.eh_gestao()) or representante_id = (select app.meu_representante_id()));
create policy amostra_itens_ver on public.amostra_itens for select to authenticated
  using (exists (select 1 from public.amostras a where a.id = amostra_id));

revoke all on public.prospectos, public.amostras, public.amostra_itens from anon, authenticated;
grant select, insert, update on public.prospectos to authenticated;
grant select on public.amostras, public.amostra_itens to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema app to authenticated;
