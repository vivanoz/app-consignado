-- Viva Noz Consignado · 17 · CRM: novas etapas do funil
-- Separado da migração seguinte porque valor novo de enum só pode ser usado
-- depois que a transação que o criou termina.
--
-- Funil em cinco etapas:
--   novo -> em_conversa (em contato) -> amostra (amostra entregue)
--        -> negociacao -> virou_loja (cliente)
-- "descartado" é a saída do funil (perdido).

alter type public.prospecto_status add value if not exists 'amostra';
alter type public.prospecto_status add value if not exists 'negociacao';
