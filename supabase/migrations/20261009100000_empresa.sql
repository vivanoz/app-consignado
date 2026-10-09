-- Viva Noz Consignado · 16 · Dados da empresa para cobrança
--
-- A chave Pix e o nome do favorecido que vão no resumo da visita enviado à
-- loja. Uma linha só. A gestão altera; quem faz visita lê, para montar o
-- documento. Fica no banco, e não no código, porque o repositório é público.

create table public.empresa (
  id             boolean primary key default true check (id),
  pix_chave      text,
  pix_favorecido text,
  pix_banco      text,
  whatsapp       text,
  atualizado_em  timestamptz not null default now()
);

insert into public.empresa (id) values (true);

create trigger empresa_atualizacao before update on public.empresa
  for each row execute function app.marca_atualizacao();
create trigger empresa_auditoria after update on public.empresa
  for each row execute function app.auditar();

alter table public.empresa enable row level security;

create policy empresa_ver on public.empresa for select to authenticated
  using ((select app.papel()) in ('gestao', 'representante'));
create policy empresa_gestao_altera on public.empresa for update to authenticated
  using ((select app.eh_gestao())) with check ((select app.eh_gestao()));

revoke all on public.empresa from anon, authenticated;
grant select, update on public.empresa to authenticated;
