-- Viva Noz Consignado · 08 · Venda varejo: novos valores de tipo
-- Fica em migração separada porque o Postgres só deixa usar um valor novo de
-- enum depois que a transação que o criou termina.

alter type public.modalidade add value if not exists 'varejo';
alter type public.mov_tipo add value if not exists 'venda_varejo';
