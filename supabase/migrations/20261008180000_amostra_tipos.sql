-- Viva Noz Consignado · 11 · Amostras: novos valores de tipo
-- Separado da migração seguinte porque valor novo de enum só pode ser usado
-- depois que a transação que o criou termina.

alter type public.local_tipo add value if not exists 'amostra';
alter type public.mov_tipo add value if not exists 'amostra';
