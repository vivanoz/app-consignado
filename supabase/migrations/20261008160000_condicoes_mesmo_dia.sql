-- Viva Noz Consignado · 07 · Corrigir comissão no mesmo dia
-- A condição de comissão não se edita; corrige-se lançando outra. Antes só
-- cabia uma por dia, o que travava a correção de um erro de digitação.
-- Agora vale a mais recente: maior data de vigência e, no empate, a lançada
-- por último.

alter table public.representante_condicoes
  drop constraint representante_condicoes_representante_id_vigente_desde_key;

create or replace function app.gera_comissoes(p_acerto_id uuid, p_recebido_em date) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_acerto     public.acertos;
  v_cond       public.representante_condicoes;
  v_percentual numeric(5, 4);
  v_valor      numeric(12, 2);
  v_vencimento date := public.vencimento_comissao(p_recebido_em);
begin
  select * into v_acerto from public.acertos where id = p_acerto_id;

  select * into v_cond from public.representante_condicoes
  where representante_id = v_acerto.representante_id and vigente_desde <= p_recebido_em
  order by vigente_desde desc, criado_em desc limit 1;
  if not found then return; end if;

  v_percentual := case when v_acerto.modalidade = 'compra_direta' then v_cond.comissao_direta else v_cond.comissao_consignado end;
  v_valor := round(v_acerto.valor_total * v_percentual, 2);
  if v_valor > 0 then
    insert into public.comissoes (representante_id, tipo, acerto_id, loja_id, base, percentual, valor, recebido_em, vencimento)
    values (v_acerto.representante_id, 'comissao', p_acerto_id, v_acerto.loja_id, v_acerto.valor_total, v_percentual, v_valor, p_recebido_em, v_vencimento);
  end if;

  -- Bônus de abertura: liberado quando a loja paga o segundo acerto.
  if v_cond.bonus_abertura > 0
     and (select count(*) from public.acertos where loja_id = v_acerto.loja_id and status = 'confirmado') = 2
     and not exists (select 1 from public.comissoes where loja_id = v_acerto.loja_id and tipo = 'bonus_abertura') then
    insert into public.comissoes (representante_id, tipo, acerto_id, loja_id, valor, recebido_em, vencimento)
    values (v_acerto.representante_id, 'bonus_abertura', p_acerto_id, v_acerto.loja_id, v_cond.bonus_abertura, p_recebido_em, v_vencimento);
  end if;
end;
$$;
