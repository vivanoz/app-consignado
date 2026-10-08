-- Viva Noz Consignado · 05 · Endereço completo da loja
-- "endereco" passa a guardar só a rua; CEP, número, complemento e UF ganham
-- campo próprio, para o cadastro vir preenchido pela busca de CEP.

alter table public.lojas
  add column cep         text check (cep ~ '^\d{8}$'),
  add column numero      text,
  add column complemento text,
  add column uf          text not null default 'PR' check (uf ~ '^[A-Z]{2}$');
