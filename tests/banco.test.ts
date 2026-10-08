import { beforeAll, describe, expect, it } from 'vitest'
import { criarBanco, uuid, type Banco } from './banco'

let b: Banco
let gestao: string, producao: string, ana: string, bia: string, inativo: string
let repAna: string, repBia: string
let lojaAna: string, lojaBia: string
const prod: Record<string, string> = {}

const itens = (linhas: Record<string, Partial<Record<'encontrado' | 'recolhido' | 'baixado' | 'reposto', number>>>) =>
  JSON.stringify(Object.entries(linhas).map(([sku, v]) => ({ produto_id: prod[sku], ...v })))
const qtds = (linhas: Record<string, number>) =>
  JSON.stringify(Object.entries(linhas).map(([sku, quantidade]) => ({ produto_id: prod[sku], quantidade })))

const visita = (uid: string, loja: string, linhas: Parameters<typeof itens>[0], id = uuid()) =>
  b.como<{ r: any }>(uid, `select public.registrar_visita($1, $2, $3::jsonb) as r`, [id, loja, itens(linhas)]).then((x) => x[0].r)

async function saldoLoja(loja: string) {
  const linhas = await b.admin(`select p.sku, s.saldo from public.saldos_loja s join public.produtos p on p.id = s.produto_id where s.loja_id = $1`, [loja])
  return Object.fromEntries(linhas.map((l) => [l.sku, l.saldo]))
}
async function saldoRep(rep: string) {
  const linhas = await b.admin(`select p.sku, s.saldo from public.saldos_representante s join public.produtos p on p.id = s.produto_id where s.representante_id = $1`, [rep])
  return Object.fromEntries(linhas.map((l) => [l.sku, l.saldo]))
}

beforeAll(async () => {
  b = await criarBanco()
  gestao = await b.criarUsuario('gestao@teste', 'gestao')
  producao = await b.criarUsuario('producao@teste', 'producao')
  ana = await b.criarUsuario('ana@teste', 'representante')
  bia = await b.criarUsuario('bia@teste', 'representante')
  inativo = await b.criarUsuario('novo@teste', null)

  for (const p of await b.admin(`select id, sku from public.produtos`)) prod[p.sku] = p.id

  ;[{ id: repAna }] = await b.como(gestao, `insert into public.representantes (nome, perfil_id) values ('Ana', $1) returning id`, [ana])
  ;[{ id: repBia }] = await b.como(gestao, `insert into public.representantes (nome, perfil_id) values ('Bia', $1) returning id`, [bia])

  await b.como(gestao, `
    insert into public.precos (produto_id, modalidade, preco_loja, preco_sugerido, vigente_desde)
    select p.id, m.modalidade::public.modalidade, v.preco - m.desconto, 16.90, date '2026-01-01'
    from public.produtos p
    join (values ('MIX-100', 12.90), ('CAR-100', 10.90), ('CAJU-100', 13.90)) v(sku, preco) on v.sku = p.sku
    cross join (values ('consignado', 0), ('compra_direta', 1)) m(modalidade, desconto)`)
})

describe('acessos', () => {
  it('usuário novo nasce inativo e não enxerga nada', async () => {
    expect(await b.como(inativo, `select * from public.produtos`)).toHaveLength(0)
    expect(await b.como(inativo, `select * from public.lojas`)).toHaveLength(0)
    expect(await b.como(inativo, `select * from public.precos`)).toHaveLength(0)
  })

  it('sem login não lê tabela nenhuma nem executa função', async () => {
    await expect(b.como(null, `select * from public.produtos`)).rejects.toThrow(/permission denied/)
    await expect(b.como(null, `select * from public.perfis`)).rejects.toThrow(/permission denied/)
    await expect(b.como(null, `select public.registrar_visita($1, $1, '[]')`, [uuid()])).rejects.toThrow(/permission denied/)
  })

  it('representante não muda o próprio papel', async () => {
    await b.como(ana, `update public.perfis set papel = 'gestao' where id = $1`, [ana])
    const [p] = await b.admin(`select papel from public.perfis where id = $1`, [ana])
    expect(p.papel).toBe('representante')
  })

  it('representante não vê custos, perfis alheios nem auditoria', async () => {
    await b.como(gestao, `insert into public.produto_custos (produto_id, custo_direto) values ($1, 5.00)`, [prod['MIX-100']])
    expect(await b.como(gestao, `select * from public.produto_custos`)).toHaveLength(1)
    expect(await b.como(ana, `select * from public.produto_custos`)).toHaveLength(0)
    expect(await b.como(producao, `select * from public.produto_custos`)).toHaveLength(0)
    expect(await b.como(ana, `select * from public.perfis`)).toHaveLength(1)
    expect(await b.como(ana, `select * from public.auditoria`)).toHaveLength(0)
    expect(await b.como(ana, `select * from public.representantes`)).toHaveLength(1)
  })

  it('produção não vê preços nem lojas', async () => {
    expect(await b.como(producao, `select * from public.precos`)).toHaveLength(0)
    expect(await b.como(producao, `select * from public.lojas`)).toHaveLength(0)
    expect(await b.como(producao, `select * from public.representantes`)).toHaveLength(2)
  })

  it('a gestão não fica sem ninguém', async () => {
    await expect(b.como(gestao, `update public.perfis set ativo = false where id = $1`, [gestao])).rejects.toThrow(/sem ninguém na gestão/)
  })

  it('preço lançado não se edita', async () => {
    await expect(b.admin(`update public.precos set preco_loja = 1`)).rejects.toThrow(/não podem ser alterados/)
  })
})

describe('lojas', () => {
  it('representante abre loja para si, não para outro', async () => {
    ;[{ id: lojaAna }] = await b.como(ana, `insert into public.lojas (nome, representante_id, modalidade) values ('Arena Sol', $1, 'kit_teste') returning id`, [repAna])
    await expect(
      b.como(ana, `insert into public.lojas (nome, representante_id) values ('Arena Furtada', $1)`, [repBia]),
    ).rejects.toThrow(/row-level security/)
    ;[{ id: lojaBia }] = await b.como(gestao, `insert into public.lojas (nome, representante_id, modalidade) values ('Arena Lua', $1, 'consignado') returning id`, [repBia])
  })

  it('cada representante vê só as suas', async () => {
    expect((await b.como(ana, `select nome from public.lojas`)).map((l) => l.nome)).toEqual(['Arena Sol'])
    expect((await b.como(bia, `select nome from public.lojas`)).map((l) => l.nome)).toEqual(['Arena Lua'])
    expect(await b.como(gestao, `select nome from public.lojas`)).toHaveLength(2)
  })

  it('representante edita contato, mas não modalidade', async () => {
    await b.como(ana, `update public.lojas set contato_nome = 'João' where id = $1`, [lojaAna])
    await expect(b.como(ana, `update public.lojas set modalidade = 'compra_direta' where id = $1`, [lojaAna])).rejects.toThrow(/Só a gestão/)
  })
})

describe('estoque do representante', () => {
  it('representante não registra a própria retirada', async () => {
    await expect(
      b.como(ana, `select public.registrar_retirada($1, $2, $3::jsonb)`, [uuid(), repAna, qtds({ 'MIX-100': 10 })]),
    ).rejects.toThrow(/gestão ou a produção/)
  })

  it('produção entrega e o saldo aparece; reenviar não duplica', async () => {
    const op = uuid()
    const args = [op, repAna, qtds({ 'MIX-100': 20, 'CAR-100': 20, 'CAJU-100': 20 })]
    await b.como(producao, `select public.registrar_retirada($1, $2, $3::jsonb)`, args)
    const [{ r }] = await b.como(producao, `select public.registrar_retirada($1, $2, $3::jsonb) as r`, args)
    expect(r.repetida).toBe(true)
    expect(await saldoRep(repAna)).toEqual({ 'MIX-100': 20, 'CAR-100': 20, 'CAJU-100': 20 })
  })

  it('cada representante vê só o próprio estoque', async () => {
    expect(await b.como(ana, `select * from public.saldos_representante`)).toHaveLength(3)
    expect(await b.como(bia, `select * from public.saldos_representante`)).toHaveLength(0)
  })

  it('devolução não passa do que o representante tem', async () => {
    await expect(
      b.como(gestao, `select public.registrar_devolucao($1, $2, $3::jsonb)`, [uuid(), repAna, qtds({ 'MIX-100': 21 })]),
    ).rejects.toThrow(/tem 20 e a devolução é de 21/)
  })
})

describe('visitas e acertos', () => {
  let segunda: string
  let acerto: string

  it('abertura: Kit Teste de 21 entra na loja e sai do representante, sem acerto', async () => {
    const r = await visita(ana, lojaAna, { 'MIX-100': { reposto: 7 }, 'CAR-100': { reposto: 7 }, 'CAJU-100': { reposto: 7 } })
    expect(r.acerto_id).toBeNull()
    expect(await saldoLoja(lojaAna)).toEqual({ 'MIX-100': 7, 'CAR-100': 7, 'CAJU-100': 7 })
    expect(await saldoRep(repAna)).toEqual({ 'MIX-100': 13, 'CAR-100': 13, 'CAJU-100': 13 })
  })

  it('não aceita encontrar mais do que havia', async () => {
    await expect(
      visita(ana, lojaAna, { 'MIX-100': { encontrado: 8 }, 'CAR-100': { encontrado: 7 }, 'CAJU-100': { encontrado: 7 } }),
    ).rejects.toThrow(/encontrados 8 pacotes, mas a loja tinha só 7/)
  })

  it('não aceita pular a contagem de um produto que está na loja', async () => {
    await expect(visita(ana, lojaAna, { 'MIX-100': { encontrado: 7 } })).rejects.toThrow(/Faltou contar Caramelizada/)
  })

  it('não aceita repor mais do que o representante tem', async () => {
    await expect(
      visita(ana, lojaAna, { 'MIX-100': { encontrado: 7, reposto: 14 }, 'CAR-100': { encontrado: 7 }, 'CAJU-100': { encontrado: 7 } }),
    ).rejects.toThrow(/tem 13 pacotes e a reposição é de 14/)
  })

  it('outro representante não registra visita na loja alheia', async () => {
    await expect(visita(bia, lojaAna, { 'MIX-100': { encontrado: 7 } })).rejects.toThrow(/outro representante/)
  })

  it('visita com erro não deixa rastro', async () => {
    expect(await b.admin(`select 1 from public.visitas where loja_id = $1`, [lojaAna])).toHaveLength(1)
    expect(await saldoLoja(lojaAna)).toEqual({ 'MIX-100': 7, 'CAR-100': 7, 'CAJU-100': 7 })
  })

  it('reposição: calcula vendido, recolhe, baixa, repõe e gera o acerto com o preço vigente', async () => {
    segunda = uuid()
    const linhas = {
      'MIX-100': { encontrado: 3, reposto: 7 }, // vendeu 4 -> fica 10
      'CAR-100': { encontrado: 0, reposto: 10 }, // vendeu 7 -> fica 10
      'CAJU-100': { encontrado: 6, recolhido: 2, baixado: 1, reposto: 0 }, // vendeu 1 -> fica 3
    }
    const r = await visita(ana, lojaAna, linhas, segunda)
    acerto = r.acerto_id
    // 4 x 12,90 + 7 x 10,90 + 1 x 13,90
    expect(Number(r.valor_total)).toBe(141.8)
    expect(await saldoLoja(lojaAna)).toEqual({ 'MIX-100': 10, 'CAR-100': 10, 'CAJU-100': 3 })
    expect(await saldoRep(repAna)).toEqual({ 'MIX-100': 6, 'CAR-100': 3, 'CAJU-100': 15 })

    const repetida = await visita(ana, lojaAna, linhas, segunda)
    expect(repetida.repetida).toBe(true)
    expect(repetida.acerto_id).toBe(acerto)
    expect(await b.admin(`select 1 from public.acertos where loja_id = $1`, [lojaAna])).toHaveLength(1)
    expect(await saldoLoja(lojaAna)).toEqual({ 'MIX-100': 10, 'CAR-100': 10, 'CAJU-100': 3 })
  })

  it('todo pacote está em algum lugar: nada some na conta', async () => {
    const [{ total }] = await b.admin(`
      select sum(case when destino in ('representante','loja','vendido','baixa') then quantidade else 0 end)
           - sum(case when origem  in ('representante','loja','vendido','baixa') then quantidade else 0 end) as total
      from public.movimentacoes where representante_id = $1`, [repAna])
    expect(Number(total)).toBe(60)
  })

  it('o acerto guarda o preço da data, mesmo que a tabela mude depois', async () => {
    await b.como(gestao, `insert into public.precos (produto_id, modalidade, preco_loja, vigente_desde) values ($1, 'consignado', 99, app.hoje() + 1)`, [prod['MIX-100']])
    const [i] = await b.admin(`select preco_unitario from public.acerto_itens where acerto_id = $1 and produto_id = $2`, [acerto, prod['MIX-100']])
    expect(Number(i.preco_unitario)).toBe(12.9)
  })

  it('representante vê o acerto da sua loja; a outra não vê', async () => {
    expect(await b.como(ana, `select * from public.acertos`)).toHaveLength(1)
    expect(await b.como(bia, `select * from public.acertos`)).toHaveLength(0)
    expect(await b.como(bia, `select * from public.visitas`)).toHaveLength(0)
    expect(await b.como(bia, `select * from public.movimentacoes`)).toHaveLength(0)
    expect(await b.como(producao, `select * from public.acertos`)).toHaveLength(0)
  })

  it('representante não confirma pagamento', async () => {
    await expect(b.como(ana, `select public.confirmar_pagamento($1, 141.80)`, [acerto])).rejects.toThrow(/Só a gestão confirma/)
  })

  it('gestão confirma só com o valor exato, e uma única vez', async () => {
    await expect(b.como(gestao, `select public.confirmar_pagamento($1, 140)`, [acerto])).rejects.toThrow(/diferente do valor do acerto/)
    await b.como(gestao, `select public.confirmar_pagamento($1, 141.80)`, [acerto])
    const [a] = await b.admin(`select status, confirmado_por from public.acertos where id = $1`, [acerto])
    expect(a).toEqual({ status: 'confirmado', confirmado_por: gestao })
    await expect(b.como(gestao, `select public.confirmar_pagamento($1, 141.80)`, [acerto])).rejects.toThrow(/já foi confirmado/)
  })

  it('ninguém grava nem altera movimentação por fora das funções', async () => {
    await expect(
      b.como(ana, `insert into public.movimentacoes (operacao_id, tipo, produto_id, quantidade, origem, destino, representante_id, registrado_por)
                   values ($1, 'retirada', $2, 100, 'fabrica', 'representante', $3, $4)`, [uuid(), prod['MIX-100'], repAna, ana]),
    ).rejects.toThrow(/permission denied/)
    await expect(b.como(gestao, `update public.acertos set valor_total = 1`)).rejects.toThrow(/permission denied/)
    await expect(b.admin(`update public.movimentacoes set quantidade = 1`)).rejects.toThrow(/não podem ser alterados/)
    await expect(b.admin(`delete from public.movimentacoes`)).rejects.toThrow(/não podem ser alterados/)
  })

  it('visita com acerto pago não pode ser estornada', async () => {
    await expect(b.como(gestao, `select public.estornar_visita($1, 'teste')`, [segunda])).rejects.toThrow(/já foi pago/)
  })

  it('estorno desfaz a última visita e cancela o acerto pendente', async () => {
    const antesLoja = await saldoLoja(lojaAna)
    const antesRep = await saldoRep(repAna)
    const r = await visita(ana, lojaAna, { 'MIX-100': { encontrado: 5, reposto: 2 }, 'CAR-100': { encontrado: 10 }, 'CAJU-100': { encontrado: 3 } })
    expect(Number(r.valor_total)).toBe(64.5)
    await expect(b.como(ana, `select public.estornar_visita($1, 'contei errado')`, [r.visita_id])).rejects.toThrow(/Só a gestão/)
    await b.como(gestao, `select public.estornar_visita($1, 'contagem errada')`, [r.visita_id])
    expect(await saldoLoja(lojaAna)).toEqual(antesLoja)
    expect(await saldoRep(repAna)).toEqual(antesRep)
    const [a] = await b.admin(`select status from public.acertos where id = $1`, [r.acerto_id])
    expect(a.status).toBe('cancelado')
    await expect(b.como(gestao, `select public.estornar_visita($1, 'de novo')`, [r.visita_id])).rejects.toThrow(/já foi estornada/)
  })

  it('loja com saldo não vira compra direta', async () => {
    await expect(b.como(gestao, `update public.lojas set modalidade = 'compra_direta' where id = $1`, [lojaAna])).rejects.toThrow(/ainda tem produto em consignação/)
  })
})

describe('compra direta', () => {
  it('o produto sai do representante, não fica saldo na loja e o acerto usa o preço da compra direta', async () => {
    await b.como(gestao, `update public.lojas set modalidade = 'compra_direta' where id = $1`, [lojaBia])
    await b.como(gestao, `select public.registrar_retirada($1, $2, $3::jsonb)`, [uuid(), repBia, qtds({ 'MIX-100': 10, 'CAR-100': 10, 'CAJU-100': 10 })])
    const r = await visita(bia, lojaBia, { 'MIX-100': { reposto: 10 }, 'CAR-100': { reposto: 10 }, 'CAJU-100': { reposto: 10 } })
    // 10 x (11,90 + 9,90 + 12,90)
    expect(Number(r.valor_total)).toBe(347)
    expect(await saldoLoja(lojaBia)).toEqual({})
    expect(await saldoRep(repBia)).toEqual({ 'MIX-100': 0, 'CAR-100': 0, 'CAJU-100': 0 })
  })
})

describe('histórico', () => {
  it('alterações de cadastro ficam na auditoria com autor', async () => {
    const linhas = await b.como(gestao, `select operacao, autor, antes ->> 'contato_nome' as antes, depois ->> 'contato_nome' as depois
      from public.auditoria where tabela = 'lojas' and registro_id = $1 and operacao = 'UPDATE' order by id limit 1`, [lojaAna])
    expect(linhas[0]).toEqual({ operacao: 'UPDATE', autor: ana, antes: null, depois: 'João' })
  })
})
