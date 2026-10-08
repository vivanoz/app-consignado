-- Viva Noz Consignado · 14 · Produtos que cada loja trabalha
--
-- Nem toda loja vende todos os sabores. Aqui fica o que a loja NÃO trabalha:
-- sem nenhuma linha, ela trabalha com a linha inteira, e produto novo já
-- entra para todas. O app usa isso para não pedir reposição nem mostrar na
-- visita um sabor que a loja não compra.

create table public.loja_produtos_fora (
  loja_id    uuid not null references public.lojas (id),
  produto_id uuid not null references public.produtos (id),
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em  timestamptz not null default now(),
  primary key (loja_id, produto_id)
);

alter table public.loja_produtos_fora enable row level security;

-- Vale a mesma regra da loja: gestão em todas, representante nas suas.
create policy loja_produtos_fora_ver on public.loja_produtos_fora for select to authenticated
  using ((select app.vejo_loja(loja_id)));
create policy loja_produtos_fora_insere on public.loja_produtos_fora for insert to authenticated
  with check ((select app.vejo_loja(loja_id)));
create policy loja_produtos_fora_remove on public.loja_produtos_fora for delete to authenticated
  using ((select app.vejo_loja(loja_id)));

revoke all on public.loja_produtos_fora from anon, authenticated;
grant select, insert, delete on public.loja_produtos_fora to authenticated;
