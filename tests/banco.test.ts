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

  // Combinado padrão: 15% no consignado, 12% na compra direta, bônus de R$ 30.
  await b.como(gestao, `insert into public.representante_condicoes (representante_id, vigente_desde) values ($1, date '2026-01-01'), ($2, date '2026-01-01')`, [repAna, repBia])

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

  it('quem não tem cadastro de representante não registra visita', async () => {
    await expect(visita(producao, lojaAna, { 'MIX-100': { encontrado: 7 } })).rejects.toThrow(/outro representante/)
    await expect(b.como(producao, `select public.definir_foto_representante($1, $2)`, [repAna, `representantes/${repAna}/x.jpg`])).rejects.toThrow(/sua própria foto/)
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

describe('comissão do representante', () => {
  const comissoes = (uid: string) =>
    b.como(uid, `select tipo, valor::float, base::float, percentual::float, status, vencimento::text, recebido_em::text from public.comissoes order by criado_em, tipo`)

  it('vencimento é o 5º dia útil do mês seguinte ao do Pix', async () => {
    const [d] = await b.admin(`select
      public.vencimento_comissao(date '2026-09-30')::text as set30,
      public.vencimento_comissao(date '2026-10-01')::text as out01,
      public.vencimento_comissao(date '2026-10-31')::text as out31,
      public.vencimento_comissao(date '2026-12-15')::text as dez15`)
    // Outubro/2026 começa numa quinta: 1, 2, 5, 6, 7.
    expect(d.set30).toBe('2026-10-07')
    // Novembro/2026: dia 1 é domingo e dia 2 é Finados: 3, 4, 5, 6, 9.
    expect(d.out01).toBe('2026-11-09')
    expect(d.out31).toBe('2026-11-09')
    // Janeiro/2027: dia 1 é feriado, 2 e 3 são fim de semana: 4, 5, 6, 7, 8.
    expect(d.dez15).toBe('2027-01-08')
  })

  it('confirmar o Pix gera a comissão com percentual, valor e vencimento', async () => {
    const [esperado] = await b.admin(`select public.vencimento_comissao(app.hoje())::text as v, app.hoje()::text as hoje`)
    // Acerto de 141,80 da Arena Sol confirmado acima: 15% = 21,27.
    // A compra direta da Arena Lua ainda não foi paga: sem comissão.
    expect(await comissoes(gestao)).toEqual([
      { tipo: 'comissao', valor: 21.27, base: 141.8, percentual: 0.15, status: 'pendente', vencimento: esperado.v, recebido_em: esperado.hoje },
    ])
  })

  it('compra direta paga gera comissão de 12%', async () => {
    const [a] = await b.admin(`select id, valor_total::float as valor from public.acertos where loja_id = $1 and status = 'pendente'`, [lojaBia])
    await b.como(gestao, `select public.confirmar_pagamento($1, $2)`, [a.id, a.valor])
    const [c] = await b.admin(`select valor::float, percentual::float from public.comissoes where acerto_id = $1`, [a.id])
    expect(c).toEqual({ valor: 41.64, percentual: 0.12 }) // 12% de 347,00
  })

  it('segundo acerto pago da loja libera o bônus de abertura, uma única vez', async () => {
    const r = await visita(ana, lojaAna, { 'MIX-100': { encontrado: 8 }, 'CAR-100': { encontrado: 10 }, 'CAJU-100': { encontrado: 3 } })
    expect(Number(r.valor_total)).toBe(25.8)
    await b.como(gestao, `select public.confirmar_pagamento($1, 25.80)`, [r.acerto_id])
    const doAcerto = await b.admin(`select tipo, valor::float from public.comissoes where acerto_id = $1 order by tipo`, [r.acerto_id])
    expect(doAcerto).toEqual([{ tipo: 'comissao', valor: 3.87 }, { tipo: 'bonus_abertura', valor: 30 }])

    const r3 = await visita(ana, lojaAna, { 'MIX-100': { encontrado: 7 }, 'CAR-100': { encontrado: 10 }, 'CAJU-100': { encontrado: 3 } })
    await b.como(gestao, `select public.confirmar_pagamento($1, 12.90)`, [r3.acerto_id])
    expect(await b.admin(`select 1 from public.comissoes where loja_id = $1 and tipo = 'bonus_abertura'`, [lojaAna])).toHaveLength(1)
  })

  it('cada representante vê só as suas comissões; produção não vê nenhuma', async () => {
    expect(await comissoes(ana)).toHaveLength(4)
    expect(await comissoes(bia)).toHaveLength(1)
    expect(await comissoes(producao)).toHaveLength(0)
    expect(await comissoes(gestao)).toHaveLength(5)
  })

  it('representante não registra o próprio repasse', async () => {
    const ids = (await b.admin(`select id from public.comissoes where representante_id = $1`, [repAna])).map((c) => c.id)
    await expect(b.como(ana, `select public.registrar_repasse($1, $2, $3::uuid[])`, [uuid(), repAna, ids])).rejects.toThrow(/Só a gestão/)
  })

  it('repasse não mistura comissão de outro representante', async () => {
    const ids = (await b.admin(`select id from public.comissoes`)).map((c) => c.id)
    await expect(b.como(gestao, `select public.registrar_repasse($1, $2, $3::uuid[])`, [uuid(), repAna, ids])).rejects.toThrow(/de outro representante/)
    expect(await b.admin(`select 1 from public.repasses`)).toHaveLength(0)
  })

  it('gestão paga um grupo de comissões: soma, marca como pagas e não paga duas vezes', async () => {
    const todas = await b.admin(`select id from public.comissoes where representante_id = $1 order by criado_em, tipo`, [repAna])
    const grupo = todas.slice(0, 3).map((c) => c.id) // 21,27 + 3,87 + 30,00
    const id = uuid()
    const args = [id, repAna, grupo, `repasses/${id}/pix.jpg`]
    const [{ r }] = await b.como(gestao, `select public.registrar_repasse($1, $2, $3::uuid[], null, $4) as r`, args)
    expect(Number(r.valor_total)).toBe(55.14)

    const [{ r: deNovo }] = await b.como(gestao, `select public.registrar_repasse($1, $2, $3::uuid[], null, $4) as r`, args)
    expect(deNovo.repetida).toBe(true)
    await expect(b.como(gestao, `select public.registrar_repasse($1, $2, $3::uuid[])`, [uuid(), repAna, grupo])).rejects.toThrow(/já foi paga/)

    expect(await b.admin(`select status, count(*)::int as n from public.comissoes where representante_id = $1 group by status order by status`, [repAna]))
      .toEqual([{ status: 'pendente', n: 1 }, { status: 'paga', n: 3 }])
    expect(await b.como(ana, `select valor_total::float as valor, comprovante_path from public.repasses`))
      .toEqual([{ valor: 55.14, comprovante_path: `repasses/${id}/pix.jpg` }])
    expect(await b.como(bia, `select 1 from public.repasses`)).toHaveLength(0)
  })

  it('comissão corrigida no mesmo dia: vale a lançada por último', async () => {
    await b.como(gestao, `insert into public.representante_condicoes (representante_id, comissao_direta) values ($1, 0.10)`, [repBia])
    await b.como(gestao, `insert into public.representante_condicoes (representante_id, comissao_direta) values ($1, 0.20)`, [repBia])
    await b.como(gestao, `select public.registrar_retirada($1, $2, $3::jsonb)`, [uuid(), repBia, qtds({ 'MIX-100': 10 })])
    const r = await visita(bia, lojaBia, { 'MIX-100': { reposto: 10 } })
    await b.como(gestao, `select public.confirmar_pagamento($1, 119.00)`, [r.acerto_id])
    const [c] = await b.admin(`select valor::float, percentual::float from public.comissoes where acerto_id = $1 and tipo = 'comissao'`, [r.acerto_id])
    expect(c).toEqual({ valor: 23.8, percentual: 0.2 })
  })

  it('ninguém altera comissão por fora das funções', async () => {
    await expect(b.como(gestao, `update public.comissoes set valor = 1`)).rejects.toThrow(/permission denied/)
    await expect(b.como(ana, `update public.comissoes set status = 'paga'`)).rejects.toThrow(/permission denied/)
  })
})

describe('fotos e comprovantes', () => {
  const enviar = (uid: string, bucket: string, nome: string) =>
    b.como(uid, `insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, nome])
  const ler = (uid: string) => b.como<{ name: string }>(uid, `select name from storage.objects order by name`)

  it('representante envia foto e comprovante só do que é seu', async () => {
    const [acertoAna] = await b.admin(`select id from public.acertos where loja_id = $1 limit 1`, [lojaAna])
    await enviar(ana, 'fotos', `lojas/${lojaAna}/fachada.jpg`)
    await enviar(ana, 'fotos', `representantes/${repAna}/perfil.jpg`)
    await enviar(ana, 'comprovantes', `acertos/${acertoAna.id}/pix.jpg`)
    await expect(enviar(ana, 'fotos', `lojas/${lojaBia}/fachada.jpg`)).rejects.toThrow(/row-level security/)
    await expect(enviar(ana, 'fotos', `representantes/${repBia}/perfil.jpg`)).rejects.toThrow(/row-level security/)
    await expect(enviar(bia, 'comprovantes', `acertos/${acertoAna.id}/pix.jpg`)).rejects.toThrow(/row-level security/)
    await expect(enviar(ana, 'comprovantes', `repasses/${uuid()}/pix.jpg`)).rejects.toThrow(/row-level security/)
    await expect(enviar(ana, 'fotos', `qualquer/coisa.jpg`)).rejects.toThrow(/row-level security/)
    await expect(enviar(inativo, 'fotos', `representantes/${repAna}/x.jpg`)).rejects.toThrow(/row-level security/)

    const caminho = `acertos/${acertoAna.id}/pix.jpg`
    await expect(b.como(bia, `select public.anexar_comprovante_acerto($1, $2)`, [acertoAna.id, caminho])).rejects.toThrow(/não encontrado/)
    await b.como(gestao, `select public.anexar_comprovante_acerto($1, $2)`, [acertoAna.id, caminho])
    const [a] = await b.admin(`select comprovante_path from public.acertos where id = $1`, [acertoAna.id])
    expect(a.comprovante_path).toBe(caminho)
  })

  it('cada um lê só os arquivos do que enxerga', async () => {
    expect(await ler(ana)).toHaveLength(3)
    // A outra representante vê a foto de perfil da colega, mas não a loja nem o comprovante.
    expect((await ler(bia)).map((o) => o.name)).toEqual([`representantes/${repAna}/perfil.jpg`])
    expect(await ler(gestao)).toHaveLength(3)
    expect(await ler(inativo)).toHaveLength(0)
  })
})

describe('produção e venda varejo', () => {
  const vender = (uid: string, rep: string, linhas: Record<string, number>, id = uuid()) =>
    b.como<{ r: any }>(uid, `select public.registrar_venda_varejo($1, $2, $3::jsonb) as r`, [id, rep, qtds(linhas)]).then((x) => x[0].r)

  it('produção registra o lote e o pacote entra na fábrica; representante não registra', async () => {
    await expect(b.como(ana, `select public.registrar_producao($1, $2, 40)`, [uuid(), prod['MIX-100']])).rejects.toThrow(/gestão ou a produção/)
    const [antes] = await b.admin(`select coalesce((select saldo from public.saldos_fabrica where produto_id = $1), 0) as saldo`, [prod['MIX-100']])
    await b.como(producao, `select public.registrar_producao($1, $2, 40)`, [uuid(), prod['MIX-100']])
    const [depois] = await b.admin(`select saldo from public.saldos_fabrica where produto_id = $1`, [prod['MIX-100']])
    expect(depois.saldo - antes.saldo).toBe(40)
    // Representante não enxerga a produção: nem os lotes, nem a movimentação de entrada na fábrica.
    expect(await b.como(ana, `select * from public.lotes_producao`)).toHaveLength(0)
    expect(await b.como(ana, `select * from public.movimentacoes where tipo = 'producao'`)).toHaveLength(0)
  })

  it('venda varejo baixa o estoque de quem vendeu e fatura pelo preço médio de R$ 15', async () => {
    const antes = await saldoRep(repAna)
    const id = uuid()
    const r = await vender(ana, repAna, { 'MIX-100': 2, 'CAJU-100': 3 }, id)
    expect(Number(r.valor_total)).toBe(75)
    const depois = await saldoRep(repAna)
    expect(depois['MIX-100']).toBe(antes['MIX-100'] - 2)
    expect(depois['CAJU-100']).toBe(antes['CAJU-100'] - 3)
    expect(depois['CAR-100']).toBe(antes['CAR-100'])

    const repetida = await vender(ana, repAna, { 'MIX-100': 2, 'CAJU-100': 3 }, id)
    expect(repetida.repetida).toBe(true)
    expect(await saldoRep(repAna)).toEqual(depois)

    const [a] = await b.admin(`select modalidade, loja_id, visita_id, status, valor_total::float as valor from public.acertos where id = $1`, [r.acerto_id])
    expect(a).toEqual({ modalidade: 'varejo', loja_id: null, visita_id: null, status: 'pendente', valor: 75 })
  })

  it('não vende mais do que tem, nem em nome de outro representante', async () => {
    await expect(vender(ana, repAna, { 'CAR-100': 99 })).rejects.toThrow(/o estoque no app é de \d+ e a venda é de 99/)
    await expect(vender(ana, repBia, { 'MIX-100': 1 })).rejects.toThrow(/só registra as suas próprias vendas/)
    await expect(vender(producao, repAna, { 'MIX-100': 1 })).rejects.toThrow(/só registra as suas próprias vendas/)
  })

  it('cada um vê só as próprias vendas; a gestão vê todas', async () => {
    expect(await b.como(ana, `select 1 from public.vendas_varejo`)).toHaveLength(1)
    expect(await b.como(bia, `select 1 from public.vendas_varejo`)).toHaveLength(0)
    expect(await b.como(bia, `select 1 from public.acertos where modalidade = 'varejo'`)).toHaveLength(0)
    expect(await b.como(gestao, `select 1 from public.vendas_varejo`)).toHaveLength(1)
  })

  it('dinheiro do varejo confirmado gera comissão de varejo, sem bônus de abertura', async () => {
    const [a] = await b.admin(`select id from public.acertos where modalidade = 'varejo' and status = 'pendente'`)
    await expect(b.como(ana, `select public.confirmar_pagamento($1, 75)`, [a.id])).rejects.toThrow(/Só a gestão/)
    await b.como(gestao, `select public.confirmar_pagamento($1, 75)`, [a.id])
    const linhas = await b.admin(`select tipo, valor::float, percentual::float, loja_id from public.comissoes where acerto_id = $1`, [a.id])
    expect(linhas).toEqual([{ tipo: 'comissao', valor: 11.25, percentual: 0.15, loja_id: null }])
  })

  it('quem tem comissão zero vende no varejo sem gerar comissão', async () => {
    await b.como(gestao, `insert into public.representante_condicoes (representante_id, comissao_consignado, comissao_direta, comissao_varejo, bonus_abertura) values ($1, 0, 0, 0, 0)`, [repBia])
    await b.como(gestao, `select public.registrar_retirada($1, $2, $3::jsonb)`, [uuid(), repBia, qtds({ 'CAR-100': 4 })])
    const r = await vender(gestao, repBia, { 'CAR-100': 4 })
    await b.como(gestao, `select public.confirmar_pagamento($1, 60)`, [r.acerto_id])
    expect(await b.admin(`select 1 from public.comissoes where acerto_id = $1`, [r.acerto_id])).toHaveLength(0)
  })

  it('estorno devolve o estoque e cancela o acerto; venda paga não se estorna', async () => {
    const antes = await saldoRep(repAna)
    const r = await vender(ana, repAna, { 'MIX-100': 1 })
    await expect(b.como(ana, `select public.estornar_venda_varejo($1, 'errei')`, [r.venda_id])).rejects.toThrow(/Só a gestão/)
    await b.como(gestao, `select public.estornar_venda_varejo($1, 'digitou errado')`, [r.venda_id])
    expect(await saldoRep(repAna)).toEqual(antes)
    const [a] = await b.admin(`select status from public.acertos where id = $1`, [r.acerto_id])
    expect(a.status).toBe('cancelado')

    const [paga] = await b.admin(`select venda_varejo_id as id from public.acertos where modalidade = 'varejo' and status = 'confirmado' limit 1`)
    await expect(b.como(gestao, `select public.estornar_venda_varejo($1, 'teste')`, [paga.id])).rejects.toThrow(/já foi confirmado/)
  })

  it('loja não pode ser cadastrada como varejo', async () => {
    await expect(b.como(gestao, `update public.lojas set modalidade = 'varejo' where id = $1`, [lojaBia])).rejects.toThrow(/lojas_sem_varejo/)
  })
})

describe('potenciais clientes e amostras', () => {
  let potencial: string
  const amostra = (uid: string, prospecto: string, linhas: Record<string, number>, id = uuid()) =>
    b.como<{ r: any }>(uid, `select public.registrar_amostra($1, $2, $3::jsonb) as r`, [id, prospecto, qtds(linhas)]).then((x) => x[0].r)

  it('representante cadastra o seu potencial cliente; o outro não vê', async () => {
    ;[{ id: potencial }] = await b.como(ana, `insert into public.prospectos (nome, representante_id) values ('Arena Nova', $1) returning id`, [repAna])
    await expect(b.como(ana, `insert into public.prospectos (nome, representante_id) values ('De outra', $1)`, [repBia])).rejects.toThrow(/row-level security/)
    expect(await b.como(bia, `select 1 from public.prospectos`)).toHaveLength(0)
    expect(await b.como(producao, `select 1 from public.prospectos`)).toHaveLength(0)
    expect(await b.como(gestao, `select 1 from public.prospectos`)).toHaveLength(1)
  })

  it('amostra sai do estoque de quem entregou, sem acerto nem comissão', async () => {
    const antes = await saldoRep(repAna)
    const [contagem] = await b.admin(`select (select count(*) from public.acertos)::int as acertos, (select count(*) from public.comissoes)::int as comissoes`)
    const id = uuid()
    const r = await amostra(ana, potencial, { 'MIX-100': 1, 'CAJU-100': 1 }, id)
    expect(r.pacotes).toBe(2)
    expect((await amostra(ana, potencial, { 'MIX-100': 1, 'CAJU-100': 1 }, id)).repetida).toBe(true)

    const depois = await saldoRep(repAna)
    expect(depois['MIX-100']).toBe(antes['MIX-100'] - 1)
    expect(depois['CAJU-100']).toBe(antes['CAJU-100'] - 1)
    expect(await b.admin(`select (select count(*) from public.acertos)::int as acertos, (select count(*) from public.comissoes)::int as comissoes`)).toEqual([contagem])

    const [p] = await b.admin(`select status from public.prospectos where id = $1`, [potencial])
    // Amostra entregue avança o lead no funil e fica no histórico de interações.
    expect(p.status).toBe('amostra')
    expect(await b.como(ana, `select tipo, descricao from public.interacoes where prospecto_id = $1`, [potencial]))
      .toEqual([{ tipo: 'visita', descricao: 'Amostra entregue: Mix 1, Caju com Sal 1' }])
    expect(await b.admin(`select origem, destino, tipo from public.movimentacoes where operacao_id = $1 limit 1`, [id]))
      .toEqual([{ origem: 'representante', destino: 'amostra', tipo: 'amostra' }])
  })

  it('não entrega amostra sem estoque nem para potencial de outro representante', async () => {
    await expect(amostra(ana, potencial, { 'CAR-100': 99 })).rejects.toThrow(/o estoque no app é de \d+ e a amostra é de 99/)
    await expect(amostra(bia, potencial, { 'MIX-100': 1 })).rejects.toThrow(/outro representante/)
    await expect(amostra(producao, potencial, { 'MIX-100': 1 })).rejects.toThrow(/outro representante/)
    expect(await b.como(bia, `select 1 from public.amostras`)).toHaveLength(0)
  })

  it('representante não passa o potencial cliente para outro; a gestão passa', async () => {
    await expect(b.como(ana, `update public.prospectos set representante_id = $2 where id = $1`, [potencial, repBia])).rejects.toThrow(/row-level security/)
    await b.como(ana, `update public.prospectos set status = 'virou_loja', loja_id = $2 where id = $1`, [potencial, lojaAna])
    await b.como(gestao, `update public.prospectos set representante_id = $2 where id = $1`, [potencial, repBia])
    expect(await b.como(bia, `select 1 from public.prospectos`)).toHaveLength(1)
  })
})

describe('matérias-primas', () => {
  const insumo: Record<string, string> = {}
  const saldos = async () =>
    Object.fromEntries((await b.admin(`select nome, saldo::float from public.insumos_situacao`)).map((i) => [i.nome, i.saldo]))
  const CAJU = 'Castanha de caju torrada sem sal W1'
  const EMBALAGEM = 'Embalagem kraft 100 g'
  const LOGO = 'Adesivo logo central (consignado e direto)'
  const VAREJO = 'Adesivo varejo'

  it('os insumos e as receitas vêm cadastrados', async () => {
    for (const i of await b.admin(`select id, nome from public.insumos`)) insumo[i.nome] = i.id
    expect(Object.keys(insumo)).toHaveLength(11)
    const [mix] = await b.admin(`select sum(r.quantidade)::float as gramas from public.receitas r join public.insumos i on i.id = r.insumo_id
      where r.produto_id = $1 and i.unidade = 'g'`, [prod['MIX-100']])
    expect(mix.gramas).toBe(100)
  })

  it('representante não enxerga insumos, receitas, fornecedores nem compras', async () => {
    for (const tabela of ['insumos', 'receitas', 'fornecedores', 'compras', 'compra_itens', 'insumo_movimentacoes', 'insumos_situacao']) {
      expect(await b.como(ana, `select * from public.${tabela}`), tabela).toHaveLength(0)
    }
    await expect(b.como(ana, `select public.registrar_compra($1, null, '[]'::jsonb)`, [uuid()])).rejects.toThrow(/Só a gestão/)
    await expect(b.como(ana, `select public.registrar_contagem_insumo($1, $2, 10)`, [uuid(), insumo[CAJU]])).rejects.toThrow(/gestão ou a produção/)
    await expect(b.como(ana, `update public.insumos set estoque_ideal = 1`)).resolves.toHaveLength(0)
  })

  it('produção vê quantidades, mas não vê compras nem fornecedores', async () => {
    expect(await b.como(producao, `select * from public.insumos`)).toHaveLength(11)
    expect(await b.como(producao, `select * from public.compras`)).toHaveLength(0)
    expect(await b.como(producao, `select * from public.fornecedores`)).toHaveLength(0)
    await expect(b.como(producao, `select public.registrar_compra($1, null, '[]'::jsonb)`, [uuid()])).rejects.toThrow(/Só a gestão/)
  })

  it('contagem registra o estoque atual; compra soma quantidade e guarda o valor', async () => {
    // Zera o que os testes de produção acima já consumiram.
    for (const nome of [CAJU, EMBALAGEM, LOGO, VAREJO]) {
      await b.como(producao, `select public.registrar_contagem_insumo($1, $2, 0)`, [uuid(), insumo[nome]])
    }
    await b.como(producao, `select public.registrar_contagem_insumo($1, $2, 1000)`, [uuid(), insumo[CAJU]])
    const [{ id: fornecedor }] = await b.como(gestao, `insert into public.fornecedores (nome) values ('Fornecedor Teste') returning id`)
    const id = uuid()
    const itens = JSON.stringify([
      { insumo_id: insumo[CAJU], quantidade: 5000, valor: 300 },
      { insumo_id: insumo[EMBALAGEM], quantidade: 300, valor: 120 },
    ])
    const [{ r }] = await b.como(gestao, `select public.registrar_compra($1, $2, $3::jsonb, null, 30) as r`, [id, fornecedor, itens])
    expect(Number(r.valor_total)).toBe(450)
    const [{ r: repetida }] = await b.como(gestao, `select public.registrar_compra($1, $2, $3::jsonb, null, 30) as r`, [id, fornecedor, itens])
    expect(repetida.repetida).toBe(true)

    const s = await saldos()
    expect(s[CAJU]).toBe(6000)
    expect(s[EMBALAGEM]).toBe(300)
  })

  it('produzir desconta os insumos pela receita, conforme o destino do lote', async () => {
    await b.como(producao, `select public.registrar_producao($1, $2, 10)`, [uuid(), prod['MIX-100']])
    let s = await saldos()
    expect(s[CAJU]).toBe(6000 - 220) // 22 g por pacote
    expect(s[EMBALAGEM]).toBe(290)
    expect(s[LOGO]).toBe(-10) // sem estoque lançado: fica negativo, não trava a produção
    expect(s[VAREJO]).toBe(0)

    await b.como(producao, `select public.registrar_producao($1, $2, 5, null, null, null, 'varejo')`, [uuid(), prod['MIX-100']])
    s = await saldos()
    expect(s[EMBALAGEM]).toBe(285)
    expect(s[LOGO]).toBe(-10)
    expect(s[VAREJO]).toBe(-5)
  })

  it('abaixo de 30% do estoque ideal, sinaliza compra', async () => {
    await b.como(gestao, `update public.insumos set estoque_ideal = 1000 where id = $1`, [insumo[EMBALAGEM]])
    const situacao = async () => (await b.como(gestao, `select comprar, estoque_minimo::float as minimo, falta_para_o_ideal::float as falta from public.insumos_situacao where id = $1`, [insumo[EMBALAGEM]]))[0]
    expect(await situacao()).toEqual({ comprar: true, minimo: 300, falta: 715 }) // tem 285
    await b.como(gestao, `select public.registrar_contagem_insumo($1, $2, 301)`, [uuid(), insumo[EMBALAGEM]])
    expect((await situacao()).comprar).toBe(false)
    // Insumo sem estoque ideal definido não gera alerta.
    const [caju] = await b.como(gestao, `select comprar from public.insumos_situacao where id = $1`, [insumo[CAJU]])
    expect(caju.comprar).toBe(false)
  })

  it('compra e movimentação de insumo não se alteram', async () => {
    await expect(b.admin(`update public.compras set valor_total = 1`)).rejects.toThrow(/não podem ser alterados/)
    await expect(b.admin(`delete from public.insumo_movimentacoes`)).rejects.toThrow(/não podem ser alterados/)
    await expect(b.como(gestao, `insert into public.insumo_movimentacoes (operacao_id, insumo_id, tipo, quantidade, registrado_por) values ($1, $2, 'ajuste', 999, $3)`, [uuid(), insumo[CAJU], gestao])).rejects.toThrow(/permission denied/)
  })

  it('gestão edita a receita e cadastra produto novo', async () => {
    await b.como(gestao, `update public.receitas set quantidade = 25 where produto_id = $1 and insumo_id = $2`, [prod['MIX-100'], insumo[CAJU]])
    await expect(b.como(producao, `update public.receitas set quantidade = 1`)).resolves.toHaveLength(0)
    const [{ id }] = await b.como(gestao, `insert into public.produtos (sku, nome, nome_curto, ordem) values ('NOVO-100', 'Produto Novo', 'Novo', 9) returning id`)
    await b.como(gestao, `update public.produtos set ativo = false where id = $1`, [id])
    await expect(b.como(ana, `insert into public.produtos (sku, nome, nome_curto) values ('X', 'X', 'X')`)).rejects.toThrow(/row-level security/)
  })
})

describe('produtos que a loja trabalha', () => {
  it('representante marca o sabor que a sua loja não compra; não mexe na loja alheia', async () => {
    await b.como(ana, `insert into public.loja_produtos_fora (loja_id, produto_id) values ($1, $2)`, [lojaAna, prod['MIX-100']])
    await expect(b.como(ana, `insert into public.loja_produtos_fora (loja_id, produto_id) values ($1, $2)`, [lojaBia, prod['MIX-100']])).rejects.toThrow(/row-level security/)
    expect(await b.como(ana, `select 1 from public.loja_produtos_fora`)).toHaveLength(1)
    expect(await b.como(bia, `select 1 from public.loja_produtos_fora`)).toHaveLength(0)
    expect(await b.como(producao, `select 1 from public.loja_produtos_fora`)).toHaveLength(0)
    expect(await b.como(gestao, `select 1 from public.loja_produtos_fora`)).toHaveLength(1)
  })

  it('voltar a trabalhar com o sabor é só desmarcar', async () => {
    await b.como(bia, `delete from public.loja_produtos_fora where loja_id = $1`, [lojaAna])
    expect(await b.admin(`select 1 from public.loja_produtos_fora`)).toHaveLength(1)
    await b.como(ana, `delete from public.loja_produtos_fora where loja_id = $1`, [lojaAna])
    expect(await b.admin(`select 1 from public.loja_produtos_fora`)).toHaveLength(0)
  })
})

describe('DRE e fluxo de caixa', () => {
  const financeiro = async () => (await b.como<{ r: any }>(gestao, `select public.financeiro_mensal(3) as r`))[0].r
  const n = (v: unknown) => Number(v)

  it('só a gestão vê o financeiro, os custos e os lançamentos', async () => {
    await expect(b.como(ana, `select public.financeiro_mensal(3)`)).rejects.toThrow(/Só a gestão/)
    await expect(b.como(producao, `select public.financeiro_mensal(3)`)).rejects.toThrow(/Só a gestão/)
    expect(await b.como(ana, `select * from public.insumos_custo`)).toHaveLength(0)
    expect(await b.como(producao, `select * from public.insumos_custo`)).toHaveLength(0)
    await expect(b.como(ana, `insert into public.lancamentos (tipo, categoria, valor, competencia) values ('despesa', 'X', 10, app.hoje())`)).rejects.toThrow(/row-level security/)
    expect(await b.como(ana, `select * from public.lancamentos`)).toHaveLength(0)
  })

  it('custo do insumo é o que foi pago, com frete rateado, dividido pelo que foi comprado', async () => {
    // Compra do teste de matérias-primas: 5 kg de caju por R$ 300, 300 embalagens por R$ 120, frete de R$ 30.
    const custos = Object.fromEntries(
      (await b.como(gestao, `select i.nome, c.custo_unitario::float as custo from public.insumos_custo c join public.insumos i on i.id = c.insumo_id`)).map((c) => [c.nome, c.custo]),
    )
    expect(custos['Castanha de caju torrada sem sal W1']).toBeCloseTo((300 + 30 * (300 / 420)) / 5000, 6)
    expect(custos['Embalagem kraft 100 g']).toBeCloseTo((120 + 30 * (120 / 420)) / 300, 6)
  })

  it('DRE do mês bate com as vendas, e o caixa com o que entrou e saiu', async () => {
    const [esperado] = await b.admin(`select
      (select coalesce(sum(valor_total), 0) from public.acertos where status <> 'cancelado')::float as receita,
      (select coalesce(sum(valor), 0) from public.pagamentos)::float as recebido,
      (select coalesce(sum(valor), 0) from public.comissoes)::float as comissoes,
      (select coalesce(sum(valor_total), 0) from public.repasses)::float as repasses,
      (select coalesce(sum(valor_total), 0) from public.compras)::float as compras,
      (select coalesce(sum(valor_total), 0) from public.acertos where status = 'pendente')::float as a_receber`)
    const r = await financeiro()
    expect(r.meses).toHaveLength(3)
    const mes = r.meses[2] // mês corrente: todos os testes rodam hoje
    expect(n(mes.receita_lojas) + n(mes.receita_direta) + n(mes.receita_varejo)).toBeCloseTo(esperado.receita, 2)
    expect(n(mes.receita_varejo)).toBeGreaterThan(0)
    expect(n(mes.cx_lojas) + n(mes.cx_varejo)).toBeCloseTo(esperado.recebido, 2)
    expect(n(mes.comissoes)).toBeCloseTo(esperado.comissoes, 2)
    expect(n(mes.cx_repasses)).toBeCloseTo(esperado.repasses, 2)
    expect(n(mes.cx_compras)).toBeCloseTo(esperado.compras, 2)
    expect(n(r.a_receber)).toBeCloseTo(esperado.a_receber, 2)
    // Há custo de caju e de embalagem, então o Mix vendido tem custo.
    expect(n(mes.cmv)).toBeGreaterThan(0)
    expect(n(mes.amostras_pacotes)).toBe(2)
    // Meses anteriores, sem movimento.
    expect(n(r.meses[0].receita_lojas) + n(r.meses[0].cx_compras)).toBe(0)
    expect(n(r.saldo_anterior)).toBe(0)
  })

  it('despesa entra no DRE pela competência e no caixa só quando é paga; cancelada sai dos dois', async () => {
    const antes = (await financeiro()).meses[2]
    const [{ id }] = await b.como(gestao, `insert into public.lancamentos (tipo, categoria, valor, competencia) values ('despesa', 'Transporte', 80, app.hoje()) returning id`)
    await b.como(gestao, `insert into public.lancamentos (tipo, categoria, valor, competencia, pago_em) values ('aporte', 'Aporte dos sócios', 500, app.hoje(), app.hoje())`)
    let r = await financeiro()
    expect(n(r.meses[2].despesas.Transporte)).toBe(80)
    expect(n(r.meses[2].cx_despesas)).toBe(n(antes.cx_despesas))
    expect(n(r.meses[2].cx_aportes)).toBe(n(antes.cx_aportes) + 500)
    expect(n(r.a_pagar_despesas)).toBe(80)

    await b.como(gestao, `update public.lancamentos set pago_em = app.hoje() where id = $1`, [id])
    r = await financeiro()
    expect(n(r.meses[2].cx_despesas)).toBe(n(antes.cx_despesas) + 80)

    await b.como(gestao, `update public.lancamentos set cancelado_em = now() where id = $1`, [id])
    r = await financeiro()
    expect(r.meses[2].despesas.Transporte).toBeUndefined()
    expect(n(r.meses[2].cx_despesas)).toBe(n(antes.cx_despesas))
    await expect(b.admin(`delete from public.lancamentos`)).rejects.toThrow(/não podem ser alterados/)
  })
})

describe('dados de cobrança', () => {
  it('só a gestão altera a chave Pix; quem faz visita lê; produção não vê', async () => {
    await b.como(gestao, `update public.empresa set pix_chave = 'pix@exemplo.com', pix_favorecido = 'Viva Noz Teste'`)
    await b.como(ana, `update public.empresa set pix_chave = 'golpe@exemplo.com'`)
    await b.como(producao, `update public.empresa set pix_chave = 'golpe@exemplo.com'`)
    expect(await b.como(ana, `select pix_chave from public.empresa`)).toEqual([{ pix_chave: 'pix@exemplo.com' }])
    expect(await b.como(producao, `select pix_chave from public.empresa`)).toHaveLength(0)
    expect(await b.como(inativo, `select pix_chave from public.empresa`)).toHaveLength(0)
    await expect(b.como(gestao, `insert into public.empresa (id) values (true)`)).rejects.toThrow(/permission denied/)
  })
})

describe('CRM: atividades e interações', () => {
  it('cada visita fecha o lembrete de reposição anterior e abre o próximo, no prazo da loja', async () => {
    // As visitas dos testes acima já passaram pelo gatilho: sobra um lembrete aberto por loja.
    const abertos = await b.admin(`select vence_em::text, titulo, representante_id from public.atividades where loja_id = $1 and tipo = 'reposicao' and concluida_em is null`, [lojaAna])
    expect(abertos).toHaveLength(1)
    const [esperado] = await b.admin(`select (app.hoje() + 15)::text as dia`)
    expect(abertos[0]).toEqual({ vence_em: esperado.dia, titulo: 'Voltar para repor', representante_id: repAna })
    const [fechados] = await b.admin(`select count(*)::int as n from public.atividades where loja_id = $1 and tipo = 'reposicao' and concluida_em is not null`, [lojaAna])
    expect(fechados.n).toBeGreaterThan(0)

    await b.como(gestao, `update public.lojas set dias_reposicao = 7 where id = $1`, [lojaAna])
    await visita(ana, lojaAna, { 'MIX-100': { encontrado: 7 }, 'CAR-100': { encontrado: 10 }, 'CAJU-100': { encontrado: 3 } })
    const depois = await b.admin(`select (vence_em - app.hoje()) as dias from public.atividades where loja_id = $1 and tipo = 'reposicao' and concluida_em is null`, [lojaAna])
    expect(depois).toEqual([{ dias: 7 }])
  })

  it('representante cria e conclui os seus lembretes; não vê nem mexe nos de outro', async () => {
    const [{ id }] = await b.como(ana, `insert into public.atividades (titulo, vence_em, representante_id, loja_id) values ('Levar expositor novo', app.hoje() + 2, $1, $2) returning id`, [repAna, lojaAna])
    await expect(b.como(ana, `insert into public.atividades (titulo, vence_em, representante_id) values ('Para a colega', app.hoje(), $1)`, [repBia])).rejects.toThrow(/row-level security/)
    expect(await b.como(bia, `select 1 from public.atividades where representante_id = $1`, [repAna])).toHaveLength(0)
    expect(await b.como(producao, `select 1 from public.atividades`)).toHaveLength(0)

    await b.como(bia, `update public.atividades set concluida_em = now() where id = $1`, [id])
    expect((await b.admin(`select concluida_em from public.atividades where id = $1`, [id]))[0].concluida_em).toBeNull()
    await b.como(ana, `update public.atividades set concluida_em = now(), concluida_por = $2 where id = $1`, [id, ana])
    expect((await b.admin(`select concluida_em from public.atividades where id = $1`, [id]))[0].concluida_em).not.toBeNull()
    await expect(b.admin(`delete from public.atividades where id = $1`, [id])).rejects.toThrow(/não podem ser alterados/)
  })

  it('gestão cria lembrete para qualquer representante', async () => {
    await b.como(gestao, `insert into public.atividades (titulo, vence_em, representante_id) values ('Ligar para o fornecedor de expositores', app.hoje(), $1)`, [repBia])
    expect(await b.como(bia, `select titulo from public.atividades where tipo = 'lembrete'`)).toHaveLength(1)
  })

  it('interação é histórico: quem cuida registra, ninguém edita, o outro não vê', async () => {
    await b.como(ana, `insert into public.interacoes (tipo, descricao, representante_id, loja_id) values ('whatsapp', 'Pediu mais Caramelizada na próxima', $1, $2)`, [repAna, lojaAna])
    await expect(b.como(ana, `insert into public.interacoes (tipo, descricao, representante_id, loja_id) values ('nota', 'x', $1, $2)`, [repBia, lojaBia])).rejects.toThrow(/row-level security/)
    await expect(b.como(ana, `insert into public.interacoes (tipo, descricao, representante_id) values ('nota', 'sem dono', $1)`, [repAna])).rejects.toThrow(/check constraint/)
    expect(await b.como(bia, `select 1 from public.interacoes where representante_id = $1`, [repAna])).toHaveLength(0)
    await expect(b.como(ana, `update public.interacoes set descricao = 'mudei'`)).rejects.toThrow(/permission denied/)
    await expect(b.admin(`update public.interacoes set descricao = 'mudei'`)).rejects.toThrow(/não podem ser alterados/)
  })

  it('lead avança pelas etapas do funil e guarda a origem', async () => {
    const [{ id }] = await b.como(ana, `insert into public.prospectos (nome, representante_id, origem) values ('Clube Importado', $1, 'Planilha de clubes') returning id`, [repAna])
    for (const etapa of ['em_conversa', 'amostra', 'negociacao', 'virou_loja']) {
      await b.como(ana, `update public.prospectos set status = $2::public.prospecto_status where id = $1`, [id, etapa])
    }
    expect(await b.admin(`select status, origem from public.prospectos where id = $1`, [id])).toEqual([{ status: 'virou_loja', origem: 'Planilha de clubes' }])
  })
})
