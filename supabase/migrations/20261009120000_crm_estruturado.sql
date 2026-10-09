-- Viva Noz Consignado · 19 · CRM estruturado
--
-- O que um CRM de mercado tem e faltava aqui:
--   - valor estimado e previsão de fechamento de cada lead (para somar o funil);
--   - temperatura do lead (quente, morno, frio);
--   - motivo da perda e data em que o lead foi ganho ou perdido;
--   - há quanto tempo o lead está na etapa (lead parado chama atenção);
--   - tipo da atividade (ligar, visitar, mandar mensagem), como no histórico.

alter table public.prospectos
  -- Quanto a loja deve comprar por mês, em reais, se fechar.
  add column valor_estimado      numeric(12, 2) check (valor_estimado >= 0),
  add column previsao_fechamento date,
  add column temperatura         text check (temperatura in ('quente', 'morno', 'frio')),
  add column motivo_perda        text,
  add column etapa_desde         timestamptz not null default now(),
  add column encerrado_em        timestamptz;

-- Leads que já existiam: a etapa conta desde a última alteração.
-- (Em um comando só: o gatilho de atualização mexe em atualizado_em.)
update public.prospectos
set etapa_desde = atualizado_em,
    encerrado_em = case when status in ('virou_loja', 'descartado') then atualizado_em end;

alter table public.atividades
  add column acao text not null default 'tarefa'
    check (acao in ('tarefa', 'visita', 'whatsapp', 'ligacao', 'email'));

-- Ao mudar de etapa, zera o relógio da etapa e marca (ou desmarca) o
-- encerramento. Perdido sem motivo não passa.
create function app.prospectos_etapa() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.etapa_desde := now();
    if new.status in ('virou_loja', 'descartado') then
      new.encerrado_em := now();
    else
      new.encerrado_em := null;
      new.motivo_perda := null;
    end if;
  end if;
  if new.status = 'descartado' and nullif(trim(new.motivo_perda), '') is null then
    raise exception 'Informe o motivo da perda.';
  end if;
  return new;
end;
$$;

create trigger prospectos_etapa before update on public.prospectos
  for each row execute function app.prospectos_etapa();

-- Último contato de cada lead, para destacar quem está parado.
create view public.prospectos_contato with (security_invoker = true) as
  select i.prospecto_id, max(i.ocorrido_em) as ultimo_contato, count(*)::integer as contatos
  from public.interacoes i
  where i.prospecto_id is not null
  group by i.prospecto_id;

revoke all on public.prospectos_contato from anon, authenticated;
grant select on public.prospectos_contato to authenticated;
